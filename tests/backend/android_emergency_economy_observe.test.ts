import test from "node:test";
import assert from "node:assert/strict";
import { GameStageType } from "../../src-backend/TFTProtocol";
import { shouldUseEmergencyEconomyObserve } from "../../src-backend/adapters/AndroidEmergencyEconomyObserve";

test("Android emergency economy observe triggers for late low-level high-bank states", () => {
    assert.equal(
        shouldUseEmergencyEconomyObserve(
            { stageText: "4-3", type: GameStageType.PVP },
            5,
            191,
            true
        ),
        true
    );
});

test("Android emergency economy observe stays off outside safeObserve or healthy economy", () => {
    assert.equal(
        shouldUseEmergencyEconomyObserve(
            { stageText: "4-3", type: GameStageType.PVP },
            5,
            191,
            false
        ),
        false
    );
    assert.equal(
        shouldUseEmergencyEconomyObserve(
            { stageText: "2-1", type: GameStageType.AUGMENT },
            4,
            20,
            true
        ),
        false
    );
});
