import {
    fightBoardSlotPoint,
    GameStageType,
    hexSlot,
    benchSlotPoints,
    type GameStageResult,
    type SimplePoint,
} from "../TFTProtocol";
import { tftOperator } from "../TftOperator";
import { androidAdbCapture } from "../services/AndroidAdbCapture";
import type { BenchLocation, BoardLocation, LootOrb } from "../tft";
import { mouseController, MouseButtonType, screenCapture, templateLoader, templateMatcher } from "../tft";
import { sleep } from "../utils/HelperTools";
import { logger } from "../utils/Logger";
import { GameClient } from "../utils/SettingsStore";
import { classifyAndroidWindowScreenshot } from "../utils/AndroidWindowClassifier";
import { normalizeAndroidForegroundObservation } from "../services/AndroidForegroundProtocol";
import { windowHelper } from "../utils/WindowHelper";
import { normalizeRuntimeState } from "../core/StateNormalizer";
import type { ActionPlan, AdapterHealth, GameAdapter, ObservedState, PlatformTarget } from "../core/types";
import { detectAndroidLootOrbsFromScreenshot } from "../utils/AndroidLootOrbDetector";
import {
    shouldReadShopDuringAndroidObserve,
} from "./AndroidObservePolicy";
import { isLikelyOpponentBoardViewForHud, isLikelyOpponentBoardViewForLoot } from "./AndroidOpponentBoardView";
import { buildAndroidSafeObserveAutoDeploySwipes } from "./AndroidAutoDeployPoints";
import { androidBuyExpPoint, androidRefreshShopPoint, androidShopSlotPoints } from "./AndroidShopControls";
import { sortAndroidActionsForExecution } from "./AndroidActionPlanner";
import { shouldUseEmergencyEconomyObserve } from "./AndroidEmergencyEconomyObserve";

export interface AndroidEmulatorAdapterOptions {
    safeObserve?: boolean;
    fastStageRead?: boolean;
    componentReadTimeoutMs?: number;
    stageReadAttempts?: number;
    stageReadRetryDelayMs?: number;
    minWindowWidth?: number;
    minWindowHeight?: number;
}

const DEFAULT_MIN_RELIABLE_ANDROID_WINDOW_WIDTH = 850;
const DEFAULT_MIN_RELIABLE_ANDROID_WINDOW_HEIGHT = 450;
const ANDROID_SCOREBOARD_SELF_ROW_POINT: SimplePoint = { x: 0.93, y: 0.80 };

function isBoardLocation(value: unknown): value is BoardLocation {
    return typeof value === "string" && /^R[1-4]_C[1-7]$/.test(value);
}

function isBenchLocation(value: unknown): value is BenchLocation {
    return typeof value === "string" && /^SLOT_[1-9]$/.test(value);
}

function parseSlotIndex(value: unknown): number | null {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return null;
    }
    return Math.trunc(parsed);
}

function parseNormalizedPoint(rawX: unknown, rawY: unknown): SimplePoint | null {
    const x = Number(rawX);
    const y = Number(rawY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
    }
    if (x < 0 || x > 1 || y < 0 || y > 1) {
        return null;
    }
    return { x, y };
}

async function normalizeAndroidTapPoint(point: SimplePoint): Promise<SimplePoint> {
    if (point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1) {
        return point;
    }

    const frameSize = await androidAdbCapture.getFrameSize();
    if (!frameSize || frameSize.width <= 0 || frameSize.height <= 0) {
        return point;
    }

    return {
        x: Math.max(0, Math.min(1, point.x / frameSize.width)),
        y: Math.max(0, Math.min(1, point.y / frameSize.height)),
    };
}

function parseBenchIndex(value: unknown): number | null {
    if (typeof value === "string") {
        const match = value.match(/^SLOT_(\d+)$/);
        if (match) {
            const parsed = Number(match[1]);
            if (Number.isFinite(parsed)) {
                return parsed - 1;
            }
        }
    }
    return parseSlotIndex(value);
}

function normalizeBuySlotIndex(rawSlot: number): number {
    // normalizeRuntimeState currently emits shop slot as zero-based (0..4),
    // while tftOperator.buyAtSlot expects one-based (1..5).
    if (rawSlot >= 0 && rawSlot <= 4) {
        return rawSlot + 1;
    }
    return rawSlot;
}

export class AndroidEmulatorAdapter implements GameAdapter {
    public readonly target: PlatformTarget = "ANDROID_EMULATOR";
    private attached = false;
    private lastLiveHud: {
        levelInfo?: { level: number; currentXp: number; totalXp: number };
        gold?: number;
    } | null = null;

    constructor(private readonly options: AndroidEmulatorAdapterOptions = {}) {}

    public async attach(): Promise<void> {
        screenCapture.setFrameCaptureProvider(() => androidAdbCapture.capturePng());
        await windowHelper.ensureAndroidEmulatorWindowBounds(
            this.options.minWindowWidth ?? DEFAULT_MIN_RELIABLE_ANDROID_WINDOW_WIDTH,
            this.options.minWindowHeight ?? DEFAULT_MIN_RELIABLE_ANDROID_WINDOW_HEIGHT
        );
        const win = await windowHelper.findLOLWindow(GameClient.ANDROID);
        if (!win) {
            throw new Error("未找到安卓模拟器窗口");
        }

        const initResult = await tftOperator.init();
        if (!initResult.success) {
            throw new Error("TftOperator 初始化失败，无法绑定安卓窗口");
        }

        this.attached = true;
        logger.info(`[AndroidEmulatorAdapter] 已绑定窗口: ${win.title}`);
    }

    public async observe(): Promise<ObservedState> {
        const foregroundState = await this.readForegroundState();
        if (foregroundState?.augmentChoiceVisible) {
            return normalizeRuntimeState({
                client: GameClient.ANDROID,
                target: this.target,
                stageText: "augment-choice",
                stageType: GameStageType.AUGMENT,
                level: 1,
                currentXp: 0,
                totalXp: 0,
                gold: 0,
                shopUnits: [],
                benchUnits: [],
                boardUnits: [],
                equipments: [],
                metadata: {
                    hasValidStage: true,
                    foregroundState: foregroundState.state,
                    foregroundReason: foregroundState.reason,
                    augmentChoiceVisible: true,
                    ...(foregroundState.augmentChoicePoint ? { augmentChoicePoint: foregroundState.augmentChoicePoint } : {}),
                },
            });
        }

        if (foregroundState && foregroundState.state !== "LIVE_CONTENT") {
            this.lastLiveHud = null;
            return normalizeRuntimeState({
                client: GameClient.ANDROID,
                target: this.target,
                stageText: "",
                stageType: GameStageType.UNKNOWN,
                level: 1,
                currentXp: 0,
                totalXp: 0,
                gold: 0,
                shopUnits: [],
                benchUnits: [],
                boardUnits: [],
                equipments: [],
                metadata: {
                    hasValidStage: false,
                    foregroundState: foregroundState.state,
                    foregroundReason: foregroundState.reason,
                },
            });
        }

        await this.returnToOwnBoardBeforeHudReadIfNeeded();

        if (!this.attached) {
            await this.attach();
        }

        const readShop = shouldReadShopDuringAndroidObserve(this.options);
        const stageResult = await this.readConfirmedStage();
        const levelInfo = await tftOperator.getLevelInfo();
        const gold = await tftOperator.getCoinCount();
        const effectiveLevelInfo = levelInfo ?? this.lastLiveHud?.levelInfo ?? null;
        const effectiveGold = gold ?? this.lastLiveHud?.gold ?? null;
        if (!levelInfo && effectiveLevelInfo) {
            logger.debug(`[AndroidEmulatorAdapter] 沿用上一帧安卓等级: Lv.${effectiveLevelInfo.level}, 经验 ${effectiveLevelInfo.currentXp}/${effectiveLevelInfo.totalXp}`);
        }
        if (gold === null && effectiveGold !== null) {
            logger.debug(`[AndroidEmulatorAdapter] 沿用上一帧安卓金币: ${effectiveGold}`);
        }
        if (
            effectiveLevelInfo &&
            effectiveGold !== null &&
            shouldUseEmergencyEconomyObserve(stageResult, effectiveLevelInfo.level, effectiveGold, this.options.safeObserve)
        ) {
            logger.warn(
                `[AndroidEmulatorAdapter] 紧急经济观察: stage=${stageResult.stageText} ` +
                `level=${effectiveLevelInfo.level} gold=${effectiveGold}，跳过商店/装备/法球慢速读取，先花钱救场`
            );
            const state = normalizeRuntimeState({
                client: GameClient.ANDROID,
                target: this.target,
                stageText: stageResult.stageText,
                stageType: stageResult.type,
                level: effectiveLevelInfo.level,
                currentXp: effectiveLevelInfo.currentXp,
                totalXp: effectiveLevelInfo.totalXp,
                gold: effectiveGold,
                shopUnits: [],
                benchUnits: [],
                boardUnits: [],
                equipments: [],
                metadata: {
                    hasValidStage: true,
                    emergencyEconomyObserve: true,
                },
            });
            this.lastLiveHud = {
                levelInfo: effectiveLevelInfo,
                gold: effectiveGold,
            };
            return state;
        }
        const shopUnits = readShop
            ? await this.readObservedComponent("shop", () => tftOperator.getShopInfoFast(), [])
            : [];
        const lootOrbs = await this.readLootOrbs(stageResult, effectiveLevelInfo, effectiveGold);
        const benchUnits = this.options.safeObserve
            ? []
            : await this.readObservedComponent("bench", () => tftOperator.getBenchInfo(), []);
        const boardUnits = this.options.safeObserve
            ? []
            : await this.readObservedComponent("board", () => tftOperator.getFightBoardInfo(), []);
        // 装备栏读取只做截图模板匹配，不需要右键/拖拽；safeObserve 也必须保留，
        // 否则 Android 自动化永远看不到左侧装备栏，决策层不会生成 EQUIP。
        const equips = await this.readObservedComponent("equip", () => tftOperator.getEquipInfo(), []);

        // Live stability note: stageResult.type may be UNKNOWN when OCR crops fall outside expected
        // regions due to emulator resolution mismatch, shop-open UI shift, or frame timing.
        // Three known instability sources (as of Mar 2026, wave 3 investigation):
        //
        // 1. Crop offset drift — percentage-based region constants assume a fixed aspect ratio;
        //    emulators with non-standard resolutions shift the stage text out of the crop window.
        //    MITIGATED: getAndroidStageFallbackRegions() provides 9 fallback scan windows with
        //    varying percentages (TftOperator.ts lines 1783-1814).
        //
        // 2. Shop-open UI compression — when the shop is open, the topbar compresses horizontally,
        //    causing stage text to appear further left than the standard region covers.
        //    MITIGATED: androidGameStageDisplayShopOpen (TFTProtocol.ts) was widened to x=0.310-0.470
        //    to cover the leftward drift; recognizeAndroidStageWithVoting() also adds shop-open-wide
        //    and titlebar-shift variants (TftOperator.ts lines 1684-1709).
        //
        // 3. Frame timing — getGameStage() may capture mid-transition frames where text is partially
        //    obscured by animations; regression fixtures use settled frames only.
        //    MITIGATED: confirmStageWithHistory() requires 4 consecutive matching reads (TftOperator.ts
        //    lines 1821-1847) before confirming a stage.
        //
        // Remaining risk: very high-DPI emulators, emulators with title-bar/toolbar offsets not
        // captured by any fallback region, or rapid stage transitions where 4-frame confirmation
        // lags behind. UNKNOWN is a safe fallback — it triggers the "stay in place" behavior.
        if (stageResult.type === GameStageType.UNKNOWN) {
            logger.warn(
                `[AndroidEmulatorAdapter] stage OCR returned UNKNOWN — stageText="${stageResult.stageText ?? ""}". ` +
                `Possible causes: resolution crop drift, shop-open UI shift, or mid-transition frame.`
            );
        }

        const state = normalizeRuntimeState({
            client: GameClient.ANDROID,
            target: this.target,
            stageText: stageResult.stageText,
            stageType: stageResult.type,
            level: effectiveLevelInfo?.level ?? 1,
            currentXp: effectiveLevelInfo?.currentXp ?? 0,
            totalXp: effectiveLevelInfo?.totalXp ?? 0,
            gold: effectiveGold ?? 0,
            shopUnits,
            benchUnits,
            boardUnits,
            equipments: equips,
            metadata: {
                hasValidStage: stageResult.type !== GameStageType.UNKNOWN,
                lootOrbs,
            },
        });
        if (levelInfo || gold !== null) {
            this.lastLiveHud = {
                levelInfo: levelInfo ?? this.lastLiveHud?.levelInfo,
                gold: gold ?? this.lastLiveHud?.gold,
            };
        }
        return state;
    }

    private async readForegroundState(): Promise<{
        state: string;
        reason: string | null;
        augmentChoiceVisible: boolean;
        augmentChoicePoint?: SimplePoint;
    } | null> {
        try {
            const screenshot = await androidAdbCapture.capturePng();
            if (!screenshot) {
                return null;
            }
            const classification = await classifyAndroidWindowScreenshot(screenshot);
            const observation = normalizeAndroidForegroundObservation(classification);
            return {
                state: observation.state,
                reason: observation.state === "LIVE_CONTENT"
                    ? "Live HUD detected"
                    : observation.reason,
                augmentChoiceVisible: classification.augmentChoiceVisible === true,
                augmentChoicePoint: classification.augmentChoicePoint,
            };
        } catch (error: unknown) {
            logger.warn(`[AndroidEmulatorAdapter] 前台状态预检查失败: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    private async readConfirmedStage() {
        if (this.options.safeObserve || this.options.fastStageRead) {
            return tftOperator.getAndroidGameStageFast();
        }

        const attempts = Math.max(1, Math.trunc(this.options.stageReadAttempts ?? 1));
        const retryDelayMs = Math.max(0, Math.trunc(this.options.stageReadRetryDelayMs ?? 150));
        let latest = await tftOperator.getGameStage();

        for (let attempt = 1; attempt < attempts; attempt += 1) {
            if (latest.type !== GameStageType.UNKNOWN && latest.stageText) {
                return latest;
            }
            if (retryDelayMs > 0) {
                await sleep(retryDelayMs);
            }
            latest = await tftOperator.getGameStage();
        }

        return latest;
    }

    private async readObservedComponent<T>(label: string, task: () => Promise<T>, fallback: T): Promise<T> {
        const timeoutMs = Math.max(1000, Math.trunc(this.options.componentReadTimeoutMs ?? 12000));
        let timeoutId: NodeJS.Timeout | null = null;
        let timedOut = false;
        const taskPromise = task()
            .catch((error: unknown) => {
                const message = error instanceof Error ? error.message : String(error);
                logger.warn(`[AndroidEmulatorAdapter] ${label} 读取失败: ${message}`);
                return fallback;
            })
            .finally(() => {
                if (timedOut) {
                    logger.warn(`[AndroidEmulatorAdapter] ${label} 读取在超时后结束，结果已丢弃`);
                }
            });

        const timeoutPromise = new Promise<T>((resolve) => {
            timeoutId = setTimeout(() => {
                timedOut = true;
                logger.warn(`[AndroidEmulatorAdapter] ${label} 读取超过 ${timeoutMs}ms，降级为空结果`);
                resolve(fallback);
            }, timeoutMs);
        });

        try {
            return await Promise.race([taskPromise, timeoutPromise]);
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        }
    }

    private shouldSkipVisualLootFallback(
        stageResult: GameStageResult,
        levelInfo: { level: number } | null,
        gold: number | null
    ): boolean {
        return (
            stageResult.type === GameStageType.UNKNOWN &&
            (levelInfo?.level ?? 1) <= 1 &&
            (gold ?? 0) <= 0
        );
    }

    private async readLootOrbs(
        stageResult?: GameStageResult,
        levelInfo?: { level: number } | null,
        gold?: number | null
    ): Promise<LootOrb[]> {
        try {
            if (stageResult && this.shouldSkipVisualLootFallback(stageResult, levelInfo ?? null, gold ?? null)) {
                logger.info("[AndroidEmulatorAdapter] 开局/选秀疑似帧跳过战利品视觉兜底");
                return [];
            }

            // 第一优先：模板匹配法球（更精确）
            if (templateLoader.isReady() && templateMatcher.isTemplateMatchAvailable()) {
                try {
                    const templateOrbs = await tftOperator.getLootOrbs();
                    if (templateOrbs.length > 0) {
                        logger.info(`[AndroidEmulatorAdapter] 模板匹配检测到 ${templateOrbs.length} 个战利品球`);
                        return templateOrbs;
                    }
                } catch (error: unknown) {
                    logger.debug(`[AndroidEmulatorAdapter] 模板匹配法球失败: ${error instanceof Error ? error.message : String(error)}`);
                }
            }

            // 第二优先：视觉兜底检测
            const screenshot = await androidAdbCapture.capturePng();
            if (screenshot) {
                const visualOrbs = await detectAndroidLootOrbsFromScreenshot(screenshot);
                if (visualOrbs.length > 0) {
                    logger.info(`[AndroidEmulatorAdapter] 视觉兜底检测到 ${visualOrbs.length} 个战利品球`);
                    return visualOrbs;
                }
            }

            return [];
        } catch (error: unknown) {
            logger.warn(`[AndroidEmulatorAdapter] 战利品球检测失败: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }

    private async pickUpLootOrbs(maxCount: number = 8): Promise<void> {
        await this.returnToOwnBoardBeforeLootIfNeeded();
        const lootOrbs = await this.readLootOrbs();
        if (lootOrbs.length === 0) {
            logger.info("[AndroidEmulatorAdapter] PICK_LOOT 未检测到可拾取战利品球");
            return;
        }

        const typeRank: Record<string, number> = {
            gold: 0,
            blue: 1,
            normal: 2,
        };
        const sortedOrbs = [...lootOrbs]
            .sort((left, right) => {
                const leftRank = typeRank[left.type] ?? 3;
                const rightRank = typeRank[right.type] ?? 3;
                if (leftRank !== rightRank) {
                    return leftRank - rightRank;
                }
                if (left.y !== right.y) {
                    return left.y - right.y;
                }
                return left.x - right.x;
            })
            .slice(0, Math.max(1, Math.min(8, maxCount)));

        logger.info(`[AndroidEmulatorAdapter] PICK_LOOT 准备拾取 ${sortedOrbs.length}/${lootOrbs.length} 个战利品球`);
        for (const orb of sortedOrbs) {
            logger.info(`[AndroidEmulatorAdapter] PICK_LOOT ${orb.type} (${orb.x}, ${orb.y})`);
            const tapPoint = await normalizeAndroidTapPoint({ x: orb.x, y: orb.y });
            const tapped = await androidAdbCapture.tapRelative(tapPoint);
            if (!tapped) {
                await mouseController.clickAt({ x: orb.x, y: orb.y }, MouseButtonType.RIGHT);
            }
            await sleep(600);  // 缩短等待时间，提高拾取效率
        }

        // 重试一次：如果检测到的球比实际少，再检测一轮
        const retryOrbs = await this.readLootOrbs();
        if (retryOrbs.length > 0) {
            logger.info(`[AndroidEmulatorAdapter] PICK_LOOT 重试：检测到 ${retryOrbs.length} 个剩余球`);
            for (const orb of retryOrbs.slice(0, 4)) {
                const tapPoint = await normalizeAndroidTapPoint({ x: orb.x, y: orb.y });
                await androidAdbCapture.tapRelative(tapPoint);
                await sleep(600);
            }
        }
    }

    private async returnToOwnBoardBeforeLootIfNeeded(): Promise<boolean> {
        try {
            const screenshot = await androidAdbCapture.capturePng();
            if (!screenshot) {
                return false;
            }
            const classification = await classifyAndroidWindowScreenshot(screenshot);
            if (!isLikelyOpponentBoardViewForLoot(classification)) {
                return false;
            }
            const tapped = await androidAdbCapture.tapRelative(ANDROID_SCOREBOARD_SELF_ROW_POINT);
            logger.info(
                `[AndroidEmulatorAdapter] PICK_LOOT 检测到右侧玩家列表视角，先返回自己棋盘 tapped=${tapped}`
            );
            if (tapped) {
                await sleep(1200);
            }
            return tapped;
        } catch (error: unknown) {
            logger.warn(`[AndroidEmulatorAdapter] 返回自己棋盘检查失败: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    private async returnToOwnBoardBeforeHudReadIfNeeded(): Promise<boolean> {
        try {
            const screenshot = await androidAdbCapture.capturePng();
            if (!screenshot) {
                return false;
            }
            const classification = await classifyAndroidWindowScreenshot(screenshot);
            if (!isLikelyOpponentBoardViewForHud(classification)) {
                return false;
            }
            const tapped = await androidAdbCapture.tapRelative(ANDROID_SCOREBOARD_SELF_ROW_POINT);
            logger.info(
                `[AndroidEmulatorAdapter] HUD 读取前检测到右侧玩家列表视角，先返回自己棋盘 tapped=${tapped}`
            );
            if (tapped) {
                await sleep(1200);
            }
            return tapped;
        } catch (error: unknown) {
            logger.warn(`[AndroidEmulatorAdapter] HUD 读取前返回自己棋盘检查失败: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    public async execute(actions: ActionPlan[]): Promise<void> {
        const sorted = sortAndroidActionsForExecution(actions);
        let buyActionsExecuted = 0;
        let levelUpClicksExecuted = 0;

        for (const action of sorted) {
            switch (action.type) {
                case "BUY": {
                    const rawSlot = parseSlotIndex(action.payload.slot);
                    if (rawSlot === null) {
                        break;
                    }
                    const slot = normalizeBuySlotIndex(rawSlot);
                    if (slot >= 1 && slot <= 5) {
                        const slotKey = `SHOP_SLOT_${slot}` as keyof typeof androidShopSlotPoints;
                        const targetPoint = androidShopSlotPoints[slotKey];
                        const tapped = await androidAdbCapture.tapRelative(targetPoint);
                        if (!tapped) {
                            await tftOperator.buyAtSlot(slot);
                        }
                        buyActionsExecuted += 1;
                        await sleep(80);
                    }
                    break;
                }
                case "ROLL": {
                    const count = Math.min(3, Math.max(1, parseSlotIndex(action.payload.count) ?? 1));
                    for (let i = 0; i < count; i += 1) {
                        logger.info(`[AndroidEmulatorAdapter] ADB 刷新商店 ${i + 1}/${count}`);
                        const tapped = await androidAdbCapture.tapRelative(androidRefreshShopPoint);
                        if (!tapped) {
                            await tftOperator.refreshShop();
                        }
                        await sleep(120);
                    }
                    break;
                }
                case "LEVEL_UP": {
                    const count = Math.min(6, Math.max(1, parseSlotIndex(action.payload.count) ?? 1));
                    for (let i = 0; i < count; i += 1) {
                        logger.info(`[AndroidEmulatorAdapter] ADB 购买经验值 ${i + 1}/${count}`);
                        const tapped = await androidAdbCapture.tapRelative(androidBuyExpPoint);
                        if (!tapped) {
                            await tftOperator.buyExperience();
                        }
                        levelUpClicksExecuted += 1;
                        await sleep(120);
                    }
                    break;
                }
                case "MOVE": {
                    const fromBench = action.payload.fromBench;
                    const fromBoard = action.payload.fromBoard;
                    const toBoard = action.payload.toBoard;
                    const toBench = action.payload.toBench;

                    if (isBenchLocation(fromBench)) {
                        const targetBoard = await this.resolveBoardLocation(toBoard);
                        if (targetBoard) {
                            await tftOperator.moveBenchToBoard(fromBench, targetBoard);
                        }
                        break;
                    }

                    if (isBoardLocation(fromBoard) && isBoardLocation(toBoard)) {
                        await tftOperator.moveBoardToBoard(fromBoard, toBoard);
                        break;
                    }

                    if (isBoardLocation(fromBoard)) {
                        const benchIndexRaw = parseBenchIndex(toBench);
                        if (benchIndexRaw !== null) {
                            const benchIndex = Math.max(0, Math.min(8, benchIndexRaw));
                            await tftOperator.moveBoardToBench(fromBoard, benchIndex);
                        }
                    }
                    break;
                }
                case "EQUIP": {
                    const itemIndex = parseSlotIndex(action.payload.itemIndex);
                    const boardLocation = action.payload.toBoard;
                    if (itemIndex !== null && isBoardLocation(boardLocation)) {
                        const activeEquipmentSlots = (tftOperator as any).getEquipmentSlotMap?.() ?? {};
                        const equipSlotKey = `EQ_SLOT_${itemIndex + 1}` as string;
                        const fromPoint = activeEquipmentSlots[equipSlotKey];
                        const toPoint = fightBoardSlotPoint[boardLocation];
                        if (fromPoint && toPoint) {
                            await androidAdbCapture.swipeRelative(fromPoint, toPoint, 600);
                            await sleep(500);
                            logger.info(`[AndroidEmulatorAdapter] EQUIP 装备槽${itemIndex} → ${boardLocation}`);
                        } else {
                            await tftOperator.equipToBoardUnit(itemIndex, boardLocation);
                        }
                    }
                    break;
                }
                case "PICK_AUGMENT": {
                    const directPoint = parseNormalizedPoint(action.payload.x, action.payload.y);
                    if (directPoint) {
                        const tapped = await androidAdbCapture.tapRelative(directPoint);
                        if (!tapped) {
                            await mouseController.clickAt(directPoint, MouseButtonType.LEFT);
                        }
                        await sleep(500);
                        // 二次点击确认（Android TFT 可能需要双击选择增幅）
                        await androidAdbCapture.tapRelative(directPoint);
                        await sleep(1500);
                        break;
                    }
                    const slot = Math.max(1, Math.min(3, parseSlotIndex(action.payload.slot) ?? 2));
                    const slotKey = `SLOT_${slot}` as keyof typeof hexSlot;
                    const tapped = await androidAdbCapture.tapRelative(hexSlot[slotKey]);
                    if (!tapped) {
                        await mouseController.clickAt(hexSlot[slotKey], MouseButtonType.LEFT);
                    }
                    await sleep(500);
                    // 二次点击确认
                    await androidAdbCapture.tapRelative(hexSlot[slotKey]);
                    await sleep(1500);
                    break;
                }
                case "PICK_LOOT": {
                    const maxCount = Math.max(1, Math.min(6, parseSlotIndex(action.payload.count) ?? 4));
                    await this.pickUpLootOrbs(maxCount);
                    break;
                }
                case "SELL": {
                    const sellLocation = action.payload.location as string;
                    if (sellLocation) {
                        const fromBench = sellLocation.startsWith("SLOT_");
                        const fromBoard = sellLocation.startsWith("R");
                        if (fromBench || fromBoard) {
                            const fromPoint = fromBench
                                ? benchSlotPoints[sellLocation as keyof typeof benchSlotPoints]
                                : fightBoardSlotPoint[sellLocation as keyof typeof fightBoardSlotPoint];
                            if (fromPoint) {
                                // Android 卖出：拖到左下角卖出区域（经验值按钮附近）
                                const sellPoint: SimplePoint = { x: 0.05, y: 0.95 };
                                await androidAdbCapture.swipeRelative(fromPoint, sellPoint, 600);
                                await sleep(500);
                                logger.info(`[AndroidEmulatorAdapter] SELL ${sellLocation} → 左下角卖出区`);
                            }
                        }
                    }
                    break;
                }
                case "NOOP":
                default:
                    break;
            }
        }

        if (
            this.options.safeObserve === true &&
            (buyActionsExecuted > 0 || levelUpClicksExecuted > 0) &&
            !sorted.some((action) => action.type === "MOVE")
        ) {
            await this.autoDeployLikelyBenchUnitsAfterEconomyAction(buyActionsExecuted, levelUpClicksExecuted);
        }
    }

    private async autoDeployLikelyBenchUnitsAfterEconomyAction(
        buyActionsExecuted: number,
        levelUpClicksExecuted: number
    ): Promise<void> {
        const swipes = buildAndroidSafeObserveAutoDeploySwipes(
            Math.max(buyActionsExecuted, levelUpClicksExecuted)
        );

        logger.info(
            `[AndroidEmulatorAdapter] safeObserve 经济动作后盲上场 ${swipes.length} 个候选备战席槽位，` +
            `避免升人口/买棋子后空人口或闲置: buy=${buyActionsExecuted}, xp=${levelUpClicksExecuted}`
        );

        for (const swipe of swipes) {
            const moved = await androidAdbCapture.swipeRelative(
                swipe.fromPoint,
                swipe.toPoint,
                450
            );
            if (!moved) {
                await tftOperator.moveBenchToBoard(swipe.fromBench, swipe.toBoard);
            }
            await sleep(120);
        }
    }

    public async healthCheck(): Promise<AdapterHealth> {
        if (!this.attached) {
            try {
                await this.attach();
            } catch (error: unknown) {
                return {
                    ok: false,
                    detail: error instanceof Error ? error.message : String(error),
                };
            }
        }

        const win = await windowHelper.findLOLWindow(GameClient.ANDROID);
        const minWidth = this.options.minWindowWidth ?? DEFAULT_MIN_RELIABLE_ANDROID_WINDOW_WIDTH;
        const minHeight = this.options.minWindowHeight ?? DEFAULT_MIN_RELIABLE_ANDROID_WINDOW_HEIGHT;

        // 检测 BlueStacks Not Responding：窗口标题包含 "Not Responding" 时跳过执行
        if (win && win.title && win.title.includes("Not Responding")) {
            return {
                ok: false,
                detail: `BlueStacks Not Responding: ${win.title}，等待恢复`,
            };
        }

        if (win && (win.width < minWidth || win.height < minHeight)) {
            return {
                ok: false,
                detail:
                    `安卓模拟器窗口过小: ${win.width}x${win.height}，` +
                    `至少需要 ${minWidth}x${minHeight} 才能稳定识别 HUD/OCR`,
            };
        }
        return {
            ok: true,
            detail: win ? `窗口已就绪: ${win.title}` : "窗口已通过 attach 绑定",
        };
    }

    private async resolveBoardLocation(rawValue: unknown): Promise<BoardLocation | null> {
        if (isBoardLocation(rawValue)) {
            return rawValue;
        }
        if (rawValue === "AUTO_SLOT") {
            const boardUnits = await tftOperator.getFightBoardInfo();
            const boardKeys = Object.keys(fightBoardSlotPoint) as BoardLocation[];
            for (let i = 0; i < boardKeys.length && i < boardUnits.length; i += 1) {
                if (boardUnits[i] === null) {
                    return boardKeys[i];
                }
            }
            return boardKeys[0] ?? null;
        }
        return null;
    }
}
