/**
 * @file 下载英雄图标模板
 * @description 从腾讯官方 CDN 下载英雄头像，用于模板匹配识别商店棋子
 * @usage npm run download:champions
 */

import axios from "axios";
import fs from "fs";
import path from "path";
import sharp from "sharp";

const QQ_DATA_BASE = "https://game.gtimg.cn/images/lol/act/img/tft/js";
const OUTPUT_DIR = path.join(process.cwd(), "public/resources/assets/images/champion/s17");

interface ChessData {
    chessId: string;
    displayName: string;
    hero_EN_name?: string;
    originalImage?: string;
    price: string;
}

async function downloadChampionIcons(): Promise<void> {
    console.log("[download-champions] 正在从腾讯 CDN 获取英雄数据...");

    // 获取英雄列表
    const response = await axios.get(`${QQ_DATA_BASE}/chess.js`, { timeout: 10000 });
    const data = response.data;

    if (!data?.data || !Array.isArray(data.data)) {
        throw new Error("无法解析英雄数据");
    }

    const champions: ChessData[] = data.data;
    console.log(`[download-champions] 获取到 ${champions.length} 个英雄`);

    // 创建输出目录
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    // 下载每个英雄的图标
    let successCount = 0;
    let failCount = 0;

    for (const champ of champions) {
        const imageUrl = champ.originalImage;
        if (!imageUrl) {
            console.warn(`[download-champions] 跳过 ${champ.displayName} (无图标URL)`);
            failCount++;
            continue;
        }

        // 使用英文 ID 作为文件名（如果有），否则用 displayName
        const fileName = champ.hero_EN_name || champ.displayName;
        const outputPath = path.join(OUTPUT_DIR, `${fileName}.png`);

        // 如果文件已存在，跳过
        if (fs.existsSync(outputPath)) {
            console.log(`[download-champions] 已存在: ${fileName}.png`);
            successCount++;
            continue;
        }

        try {
            // 下载图片
            const imageResponse = await axios.get(imageUrl, {
                responseType: "arraybuffer",
                timeout: 5000,
            });

            // 转换为 PNG 并调整大小到 48x48（商店棋子图标标准尺寸）
            const buffer = Buffer.from(imageResponse.data);
            await sharp(buffer)
                .resize(48, 48, { fit: "cover" })
                .png()
                .toFile(outputPath);

            console.log(`[download-champions] ✓ ${fileName}.png`);
            successCount++;

            // 避免请求过快
            await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error: any) {
            console.error(`[download-champions] ✗ ${fileName}: ${error.message}`);
            failCount++;
        }
    }

    console.log(`\n[download-champions] 完成: 成功 ${successCount}, 失败 ${failCount}`);
    console.log(`[download-champions] 输出目录: ${OUTPUT_DIR}`);
}

// 执行
downloadChampionIcons().catch((error) => {
    console.error("[download-champions] 错误:", error.message);
    process.exit(1);
});
