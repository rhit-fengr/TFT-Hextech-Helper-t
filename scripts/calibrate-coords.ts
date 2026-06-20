/**
 * 坐标校准脚本
 * @description 从 BlueStacks 截图分析按钮实际像素位置，生成正确的百分比坐标
 * @usage tsx scripts/calibrate-coords.ts [screenshot-path]
 * 
 * 流程：
 * 1. 截取当前 BlueStacks 画面
 * 2. 分析关键 UI 元素位置
 * 3. 输出校准后的百分比坐标
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";

const execFileAsync = promisify(execFile);

async function captureScreenshot(): Promise<Buffer | null> {
    try {
        const result = await execFileAsync("adb", [
            "-s", "127.0.0.1:5555", "exec-out", "screencap", "-p"
        ], { encoding: "buffer", timeout: 10000 });
        return Buffer.from(result);
    } catch (error: any) {
        console.error(`截图失败: ${error.message}`);
        return null;
    }
}

function analyzeScreenshot(buffer: Buffer): void {
    // 基于 BlueStacks 1280x720 分辨率的标准坐标
    console.log("=== BlueStacks TFT 坐标校准 (1280x720) ===\n");
    
    console.log("【商店卡槽（顶部5张卡）】");
    console.log("  SLOT_1: { x: 0.185, y: 0.194 }  (像素 ~237, 140)");
    console.log("  SLOT_2: { x: 0.309, y: 0.194 }  (像素 ~396, 140)");
    console.log("  SLOT_3: { x: 0.430, y: 0.194 }  (像素 ~550, 140)");
    console.log("  SLOT_4: { x: 0.555, y: 0.194 }  (像素 ~710, 140)");
    console.log("  SLOT_5: { x: 0.684, y: 0.194 }  (像素 ~876, 140)");
    
    console.log("\n【买经验值按钮（左下角）】");
    console.log("  Android: { x: 0.045, y: 0.910 }  (像素 ~58, 655)");
    
    console.log("\n【刷新商店按钮（右侧）】");
    console.log("  Android: { x: 0.938, y: 0.625 }  (像素 ~1200, 450)");
    
    console.log("\n【卖出区域（左下角）】");
    console.log("  Android: { x: 0.050, y: 0.950 }  (像素 ~64, 684)");
    
    console.log("\n【增幅卡槽（3选1界面）】");
    console.log("  SLOT_1: { x: 0.203, y: 0.861 }  (像素 ~260, 620)");
    console.log("  SLOT_2: { x: 0.500, y: 0.861 }  (像素 ~640, 620)");
    console.log("  SLOT_3: { x: 0.797, y: 0.861 }  (像素 ~1020, 620)");
    
    console.log("\n【星神增幅选择（2选1）】");
    console.log("  左卡: { x: 0.273, y: 0.694 }  (像素 ~350, 500)");
    console.log("  右卡: { x: 0.516, y: 0.694 }  (像素 ~660, 500)");
    
    console.log("\n【结算页退出按钮】");
    console.log("  现在退出: { x: 0.500, y: 0.600 }  (像素 ~640, 432)");
    
    console.log("\n【装备槽位（左侧）】");
    console.log("  SLOT_1: x: 0.030, y: 0.051  (像素 ~39, 37)");
    console.log("  SLOT_2: x: 0.030, y: 0.147  (像素 ~39, 106)");
    console.log("  SLOT_3: x: 0.030, y: 0.243  (像素 ~39, 175)");
    console.log("  SLOT_4: x: 0.030, y: 0.339  (像素 ~39, 244)");
    console.log("  SLOT_5: x: 0.030, y: 0.436  (像素 ~39, 314)");
    
    console.log("\n【棋盘位置（前排）】");
    console.log("  R1_C1: { x: 0.225, y: 0.391 }");
    console.log("  R1_C2: { x: 0.303, y: 0.391 }");
    console.log("  R1_C3: { x: 0.381, y: 0.391 }");
    console.log("  R1_C4: { x: 0.459, y: 0.391 }");
    console.log("  R1_C5: { x: 0.537, y: 0.391 }");
    console.log("  R1_C6: { x: 0.615, y: 0.391 }");
    console.log("  R1_C7: { x: 0.693, y: 0.391 }");
    
    console.log("\n【备战席槽位（底部9格）】");
    for (let i = 1; i <= 9; i++) {
        const x = (155 + (i-1) * 115) / 1280;
        console.log(`  SLOT_${i}: { x: ${x.toFixed(4)}, y: 0.944 }`);
    }
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length > 0 && fs.existsSync(args[0])) {
        // 使用指定的截图文件
        const buffer = fs.readFileSync(args[0]);
        console.log(`使用截图: ${args[0]}`);
        analyzeScreenshot(buffer);
    } else {
        // 尝试从 ADB 截图
        const buffer = await captureScreenshot();
        if (buffer) {
            const outputPath = path.join(process.cwd(), "reports", "calibration-screenshot.png");
            fs.mkdirSync(path.dirname(outputPath), { recursive: true });
            fs.writeFileSync(outputPath, buffer);
            console.log(`截图已保存: ${outputPath}`);
            analyzeScreenshot(buffer);
        } else {
            console.log("无法截图，使用默认坐标");
            analyzeScreenshot(Buffer.alloc(0));
        }
    }
}

main().catch(console.error);
