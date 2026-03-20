# ANDROID OCR REGRESSION BOUNDARIES

This document summarizes the current regression test boundaries for Android opening, augment, and shop stage OCR (as of 2026-03-19).

## Test Coverage

The following real-device crops (see file list below) are covered by regression tests:
- Opening/augment stage (2-1, 3-2)
- Main board stages (2-5, 5-2)
- Shop-open stages (5-1, tested via shop/overlay frames)

Unit and integration tests driven from `tests/backend/android_hud_recognition.test.ts` and `tests/backend/android_recognition_replay_cli.test.ts` validate stage, champion, and overlay OCR for each crop using current image variant pipeline.

## Passing Cases

- Opening/augment crops ("recording-opening-augment-2-1-stage-raw.png", "recording-augment-3-2-stage-raw.png"): OCR reliably extracts correct stage text (e.g., "2-1", "3-2").
- Main board crops ("recording-board-2-5-stage-raw.png", "recording-board-5-2-stage-raw.png"): OCR is robust and matches expected stage ("2-5", "5-2").
- Most variant overlays and shop slots pass stage and parsing reliably under normal and shaded/blurred conditions.

## Known Issue / Failing Edge Case

- Shop-open (5-1) regression: Crop `recording-shop-5-1-stage-raw.png` is currently recognized as "3-1" instead of the correct "5-1". This is a stubborn failure confirmed both in direct utility test (android_hud_recognition) and CLI replay (android_recognition_replay_cli).
  - Exemplified by fixture `android-s16-shop-open-stage-5-1` and the OCR pipeline output.
  - Source of issue: overlay/cropping and stage text shifting due to UI variant, possibly compounded by shop open effects.
  - Test error (example):
    - Expected: `"5-1"`
    - Actual:   `"3-1"`
    - File: `examples/recordings/derived/android-real-recording-20260315-ionia/crops/recording-shop-5-1-stage-raw.png`

## Contributing Factors
- Shop-open UI overlays may shift or occlude the topbar, confusing simple normalization/threshold OCR.
- Real-device image noise and cropping variance can still defeat even augmented threshold/scaling preprocessing.
- No other opening or board crops currently display similar stage OCR confusion (this is shop-only regression).

## Manual QA/Acceptance
- As of the date above, all opening/augment/board crops except the shop-open 5-1 sample pass regression.
- The failing shop-open stage regression is confirmed and documented, not a test flake.

## Next
- Future variant/heuristic upgrades should target specifically this overlay-induced shop-open 5-1 stage OCR failure.

---
**Relevant fixture crops:**
- recording-opening-augment-2-1-stage-raw.png
- recording-opening-detail-1-4-stage-raw.png
- recording-augment-3-2-stage-raw.png
- recording-board-2-5-stage-raw.png
- recording-board-5-2-stage-raw.png
- recording-shop-5-1-stage-raw.png

For full fixture/execution state, see test logs and test scripts referenced above.