/**
 * ---
 * ANDROID OCR REGRESSION — TEST BOUNDARIES & COVERAGE
 *
 * This service underpins all OCR flows for Android game-stage, augment, shop, and HUD text recognition.
 *
 * ## Automated Regression Scope
 * - Automated tests in `tests/backend/android_hud_recognition.test.ts` assert recognition of real-device crops for:
 *   - Opening detail (e.g., `recording-opening-detail-1-4-stage-raw.png`)
 *   - Augment selection (e.g., `recording-augment-3-2-stage-raw.png`)
 *   - Board/Shop crops (e.g., `recording-board-2-5-stage-raw.png`, `recording-shop-5-1-stage-raw.png`)
 * - All main stage types (EARLY_PVE, AUGMENT, PVP) included in fixture set.
 * - The regression pipeline checks extracted text & type against expected values for each crop.
 *
 * ## Known Edge Cases & Current Boundaries
 * - Shop-open 5-1 crops are a known OCR challenge — historical false negatives possible due to font/background overlap.
 *   - This is a tracked limitation in both this service & test output (`5-1` shop occasionally fails even on new models).
 * - All other provided fixture crops in the test set pass both text & type assertions as of Mar 2026.
 *
 * ## Manual QA & Future Work
 * - Manual QA is still required for unhandled variants or newly sourced screenshots/crops.
 * - To verify boundaries, use the regression test as a source of truth and integrate new cases there on failure/new crop types.
 * - If adding/changing OCR or correction logic:
 *   - Update both the fixture test (`android_hud_recognition.test.ts`) and this docblock to clearly record boundaries and coverage.
 * - For edge cases or persistent failures, add notes as inline comments to this file or to `RecognitionUtils.ts` where variant selection is handled.
 *
 * ## References
 * - See `tests/backend/android_hud_recognition.test.ts`, fixtures in `examples/recordings/derived/android-real-recording-20260315-ionia/crops/`, and OCR normalization helpers in `RecognitionUtils.ts`.
 *
 * ---
 */

