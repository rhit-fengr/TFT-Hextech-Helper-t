/**
 * Android OCR Regression — Variant/Selection Logic
 *
 * The helpers below (e.g., buildAndroidStageOcrVariants, extractLikelyStageText, selectBestStageText)
 * implement normalization and selection for OCR results from game stage/augment/shop text crops.
 *
 * ## Role in Regression
 * - All such helpers are directly exercised by tests in `android_hud_recognition.test.ts` to assert correct OCR on
 *   a spectrum of real recorded crops (opening, augment, shop, board).
 * - If you are updating OCR, correction, or selection logic, you MUST update both the regression doc in OcrService.ts
 *   and augment/add test cases for coverage of any new edge/path.
 *
 * ## Edge Cases & Boundaries
 * - Some stage/shop crops (notably 5-1) are known to produce inconsistent OCR under certain backgrounds & fonts.
 *   - If new failures are observed, add cases & note actual/expected behavior inline.
 *
 * For detailed coverage, see top doc in OcrService.ts and test docblocks.
 */
