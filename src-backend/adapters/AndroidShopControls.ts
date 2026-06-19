import type { SimplePoint } from "../TFTProtocol";

type AndroidShopSlotKey = `SHOP_SLOT_${1 | 2 | 3 | 4 | 5}`;

// Android TFT shop controls are laid out differently from the PC client:
// shop cards are across the top and the refresh button is on the right side.
export const androidShopSlotPoints: Record<AndroidShopSlotKey, SimplePoint> = {
    SHOP_SLOT_1: { x: 0.185, y: 0.194 },  // 实测 (237, 140) @ 1280x720
    SHOP_SLOT_2: { x: 0.309, y: 0.194 },  // 实测 (395, 140)
    SHOP_SLOT_3: { x: 0.430, y: 0.194 },  // 实测 (550, 140)
    SHOP_SLOT_4: { x: 0.555, y: 0.194 },  // 实测 (710, 140)
    SHOP_SLOT_5: { x: 0.684, y: 0.194 },  // 实测 (875, 140)
};

export const androidRefreshShopPoint: SimplePoint = { x: 0.938, y: 0.625 };  // 实测 (1200, 450)
export const androidBuyExpPoint: SimplePoint = { x: 0.045, y: 0.910 };      // 实测 (57, 655)
