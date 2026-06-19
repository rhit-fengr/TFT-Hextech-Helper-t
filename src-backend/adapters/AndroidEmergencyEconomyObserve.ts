import { GameStageType, type GameStageResult } from "../TFTProtocol";

export function shouldUseEmergencyEconomyObserve(
    stageResult: Pick<GameStageResult, "stageText" | "type">,
    level: number,
    gold: number,
    safeObserve?: boolean
): boolean {
    if (safeObserve !== true || stageResult.type === GameStageType.UNKNOWN) {
        return false;
    }

    const match = stageResult.stageText.match(/^(\d+)-(\d+)$/);
    if (!match) {
        return false;
    }

    const stage = Number(match[1]);
    return (
        (stage >= 3 && level < 7 && gold >= 80) ||
        (stage >= 4 && level < 8 && gold >= 45)
    );
}
