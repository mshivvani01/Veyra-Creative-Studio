# Implementation Status: Veyra 2.0

**Last verified:** 2026-10-13
**Environment:** Windows 11, Node 22.23.1, npm 10.9.8, Google Chrome (installed) driven by Playwright 1.48.2.

Every result below comes from a run in this environment. Anything that was not run is marked **Not run**. Section V2 covers the Veyra 2.0 upgrade; sections 0–5 are earlier history (rebrand, Air Draw Replica verification) and are kept unchanged.

## V2. Veyra 2.0 creative-studio upgrade

### Starting point
The uploaded `veyra-creative-studio (2).zip` contained source identical to the previous Veyra delivery, plus a bundled `node_modules/` and the generated `public/mediapipe/` WASM copy (40 MB). Work continued from that source with a fresh `npm ci`.

### Implemented
| Area | What was built | Where |
| --- | --- | --- |
| Colour studio | **36 curated colours** in 6 collapsible groups (all requested names), custom colour (native picker + validated hex), recent colours (12, deduplicated, persisted, corruption-safe), active ring | `lib/colors.ts`, `components/ColorPanel.tsx` |
| Brushes | Pen, Marker, Pencil, Highlighter, Neon, each with its own renderer, plus the Eraser tool | `lib/drawingEngine.ts` (`renderStroke`) |
| Brush controls | Size 1–60 px with XS/S/M/L/XL presets and exact readout; opacity 10–100%; glow (neon); eraser size 8–120 px; live previews in the rail, the panel and every brush tile | `components/BrushPanel.tsx`, `BrushPreview.tsx` |
| Undo/redo | Operation history (100 steps, structurally shared snapshots): strokes, shapes, erase passes, moves, clear, open/import. Buttons disabled when unavailable. | `lib/history.ts`, `lib/airDrawSession.ts` |
| Clear | Confirmation dialog, undoable, never triggered by the camera toggle | `StudioPanels.tsx` |
| Backgrounds | Warm ivory, pure white, light lavender, pale peach, transparent, kept on a separate layer from the strokes | `constants.ts`, `App.tsx` |
| Shapes | Line, rectangle, circle, arrow. Mouse/touch drag or hand pointing, live preview, current colour/size/brush/opacity, erasable, movable, undoable. | `drawingEngine.ts`, `airDrawSession.ts` |
| Mouse/touch drawing | Pointer events with coalesced samples on the drawing canvas | `App.tsx`, `DrawingCanvas.tsx` |
| Export | Artwork-only PNG on the chosen background or transparent, `veyra-artwork-YYYY-MM-DD-HHMMSS.png` | `lib/exportImage.ts` |
| Save/restore | Local artwork library (name, save, open, delete) as structured projects in `localStorage`, with quota/unavailable handling | `lib/artworkStore.ts`, `ArtworkPanel.tsx` |
| Project files | `.veyra.json` export/import with full validation; malformed files never crash or alter the canvas | `lib/projectFile.ts` |
| Shortcuts | Ctrl/⌘+Z, Ctrl/⌘+Y, Ctrl/⌘+Shift+Z, Delete/Backspace (confirm), B, E, L, R, C, A, Esc. Ignored while typing. | `lib/shortcuts.ts` |
| Hand experience | Optional hand-guide pointer (overlay only), real pointer-smoothing setting, gapless sweeping eraser, eraser size used by the open palm, hand and mouse strokes never merge | `airDrawSession.ts`, `useAirDrawLoop.ts` |
| Performance | Committed strokes cached on an offscreen canvas and re-rendered only when the drawing's version changes; settings read from refs (no React re-render per frame) | `useAirDrawLoop.ts` |
| Credit removal | The bottom "Inspired by Air Draw · designs.bhupesh" element, its CSS (including mobile spacing rules), its constants and social icons were removed. No replacement credit was added. | `HeaderStatus.tsx`, `global.css`, `constants.ts`, `Icons.tsx` |
| Light theme only | At your request, the "Dark plum" background and its dark overlay palette were removed. All backgrounds are light, enforced by a unit test; projects asking for a dark background open on ivory. | `constants.ts`, `projectFile.ts`, `theme.test.ts` |

### Issues found and fixed during the upgrade
1. **History corruption on move.** Moving a stroke in place would also move it inside older undo snapshots. The fix moves a private copy, and a unit test checks that older snapshots stay intact.
2. **Brush preview canvases stretched full-screen** by a broad `#app canvas` CSS rule. The rule is now scoped to the three layer canvases (found in screenshots).
3. **Marker was nearly opaque** (shadow drawn at the same alpha → ~92% coverage). It was rebuilt as an edge pass plus a body pass, ~72% coverage (checked in unit tests and real pixels).
4. **Eraser left islands on fast movement** (erasing only at sampled points). It now sweeps continuously between samples (unit test).

### Verification
| Check | Result |
| --- | --- |
| `npm ci` | **Passed** |
| `npm run typecheck` | **Passed** (exit 0) |
| `npm test` | **Passed: 159/159** in 13 files. Existing 77 kept: 4 assertions updated where 2.0 deliberately changed behaviour (operation-based undo; moves use a private copy), and the 8-colour palette test replaced by the 36-colour test. Plus 82 new tests for colours, history, project files, storage, shortcuts, brushes, shapes, eraser and session tools. |
| `npm run build` | **Passed** |
| Playwright, full suite (installed Chrome) | **43 passed, 1 skipped** (optional real-photo test, run separately). The first run had 2 failures, both test-side: one tried to focus a correctly *disabled* Redo button, the other tried to set glow on a non-neon brush, where the slider is intentionally disabled. Both were fixed and re-run green. |
| Real hand photo through the real MediaPipe model | **Passed** |
| Visual QA (screenshots) | Desktop 1440×900, laptop 1280×680, phone 390×844: rail, every panel, brushes, shapes, artwork list, confirmation dialog. Phone has no horizontal page overflow (scroll width = 390). |
| Clean-extract verification of the packaged ZIP | **Passed:** `npm ci`, typecheck exit 0, 159/159 unit tests, build, Playwright 43 passed / 1 skipped |
| Live webcam with a real hand on the 2.0 build (with consent, about 60 s) | **Draw** ✅ (58k px drawn) · **Fist/Idle** ✅ (nothing drawn) · **Open-palm erase** ✅ (60k → 30k px) · **Pinch → Grab** ✅ (stroke highlighted and moved) · **Undo of a hand-made stroke** ✅ · no console errors. **Hand-drawn rectangle: inconclusive.** Two rectangles were placed, but both were very flat (about 70×6 px), so a clear diagonal box was not confirmed live. Mouse/touch shapes are verified by pixel tests. |

## Earlier history

## 0. Veyra rebrand and light theme

### What changed
| Area | Change |
| --- | --- |
| Brand | Name **Veyra** / wordmark **VEYRA**, exact tagline *Your hands. Your imagination. Your canvas.* in the loader, the How to Play card and page metadata. |
| Logo | New vector assets: `public/veyra-logo.svg` (mark + vector wordmark), `public/veyra-mark.svg`, `public/favicon.svg`. The old `public/assets/logo.svg` (Air Draw approximation) was removed. |
| Metadata | Title `Veyra — Your Hands. Your Imagination. Your Canvas.`, new description, `application-name`, Open Graph tags, favicon and apple-touch-icon, `theme-color` `#F7F3EE`. |
| Theme | `global.css` rewritten on Veyra design tokens: ivory / white / plum / lavender / coral palette, Fraunces + Inter type. Every existing id, class and breakpoint kept; added only the brand badge, tagline and camera-dot styles. |
| UI copy | Camera pill `Camera On / Camera Dim / Canvas Only` (was `ON / DIM / Dark Canvas`); saved file `veyra-<time>.png`; credit `Inspired by Air Draw · designs.bhupesh`; error/console text renamed. |
| Icons | Gesture emoji in the HUD and How to Play were replaced by line icons (draw / erase / move / idle / ready / show). |
| Package | `package.json` / lockfile name `veyra-creative-studio`, new description. Internal identifiers (`AirDrawSession`, `useAirDrawLoop`, the test hook) were deliberately left unchanged. |

### Functional changes the light theme required (not regressions)
1. **Stroke core colour.** The renderer lightened each stroke's core 50% toward white, which is about **1.1:1 contrast on ivory**, so strokes were nearly invisible. The core is now the brush colour itself. The old look remains available as `renderStroke(ctx, s, 0.5)`.
2. **Brush palette.** Neon cyan, lime, gold and white are invisible or garish on ivory (white: 1.10:1). There are still **8 colours**, now Coral, Plum, Lavender, Rose, Saffron, Sage, Ocean and Terracotta, each **≥ 3:1** on the canvas (unit-tested).
3. **Overlay colours.** The hand skeleton, eraser ring and grab highlight changed from white, pink and gold to plum, error-red and lavender. Exported PNGs use the ivory background.
4. **Camera layer.** It is drawn as a faded warm greyscale wash (CSS filter), so dark rooms don't turn the ivory page grey.
5. **Slider geometry.** The rotated desktop sliders now reserve their full visual length, so the track no longer cuts through the "Thickness" / "6px" text (an original-layout quirk that became visible on a light surface).

Gesture thresholds, the classifier, coordinate mapping, smoothing, model and WASM paths, camera lifecycle and stroke geometry are **unchanged**.

### Verification (final code)
| Check | Result |
| --- | --- |
| `npm ci` | **Passed** |
| `npm run typecheck` | **Passed** (exit code 0) |
| `npm test` | **Passed: 76/76** in 7 files. 69 carried over (one stroke-core assertion updated, one test added for the optional lightened core), plus 6 new brand/theme tests: exact tagline, palette tokens, 8 brush colours ≥3:1, WCAG AA text contrast, focus/selected ring ≥3:1, no dark-theme colours left. |
| `npm run build` | **Passed** |
| Playwright (installed Chrome) | **Passed: 27, skipped: 1** (the optional real-photo test, which needs `HAND_Y4M`). 22 carried-over app and gesture tests, with expectations updated for the new labels, colours and file name, plus 5 new `branding.spec.ts` tests: title, description and favicon; logo assets load; exact tagline; "Air Draw" only in the credit; ivory theme; compact mobile mark with no overflow or overlap. |
| Real hand photo through the real MediaPipe model | **Passed.** The hand is detected and the HUD leaves "Show hand". The skeleton overlay was also checked visually on the light theme. |
| Visual QA | Screenshots reviewed at 1440×900, 1280×800, 820×1180, 390×844 and 360×640: loader, How to Play, studio with strokes, Canvas Only, real-photo skeleton overlay, mobile palette, permission-error state. |
| Live webcam after the rebrand | **Not run.** The gesture pipeline code is unchanged and was verified live before the rebrand (sessions below). Only rendering colours changed, and these are covered by the pixel-level gesture tests. |

**Contrast (WCAG):** plum on white 14.7:1; plum-2 on white 8.8:1; muted on ivory 4.50:1; ivory on plum button 13.3:1; error text on white 5.3:1; lavender-strong focus/selected ring 4.3:1 on white. The spec's `#C7A7F7` lavender is 2.0:1 on white, so it is used for surfaces and borders only.

## 1. Starting point

The reviewed archive (`air-draw-replica-reviewed.zip`) contained source byte-identical to the previous delivery, plus an earlier version of this file and an empty `node_modules/`. The earlier audit could not install dependencies because it had no npm registry access (`ENOTCACHED`). That was an environment problem, not a project defect. On a machine with registry access, `npm ci`, the typecheck, the unit tests and the build all passed **before** any change was made, so there were no install or build errors to reproduce.

## 2. Defects found and fixed

| # | Defect | How it was found | Fix | Regression test |
|---|---|---|---|---|
| 1 | **Strokes got a tail, and grabbed strokes drifted, during gesture transitions.** The stabiliser keeps the previous gesture active for 3–4 frames, and the app kept acting on the new hand shape during those frames. Curling into a fist dragged the stroke toward the fist (stroke 44 px off target). Releasing a pinch kept moving the stroke. | New pixel-level browser tests (`gestures.spec.ts`) | `airDrawSession.ts`: draw, erase and move only when the raw pose agrees with the active gesture. A grab that pauses re-bases when it resumes, so the stroke doesn't jump. | 2 unit tests in `airDrawSession.test.ts` (verified to **fail** with the fix disabled); `gestures.spec.ts` |
| 2 | **Open palm was rarely recognised live.** The palm was read as "Ready" because the classifier also required a *spread thumb*. Most real open palms have the thumb held in. | Live webcam session 1, then analysis of recorded landmarks | `gestureClassifier.ts`: open palm = four extended fingers; the thumb is no longer required. Accuracy on recorded open-palm frames went from **35% to 100%**. | `liveLandmarks.test.ts` (real recorded data, verified to **fail** on the old classifier) and a synthetic thumb-tucked case |
| 3 | `PointSmoother` used a TypeScript parameter property, which Node 22's built-in type stripping rejects, so Playwright could not import it. | Writing `gestures.spec.ts` | Rewritten as an explicit field; behaviour unchanged. | Covered by the existing smoother unit tests |

Also added: a test-only seam in `useHandTracking.ts` (`window.__AIR_DRAW_TEST_LANDMARKER__`) so browser tests can feed scripted poses into the real app. Nothing in the app sets it.

## 3. Verification results

### Static checks and build
| Check | Command | Result |
|---|---|---|
| Install | `npm ci` | **Passed** |
| Typecheck | `npm run typecheck` | **Passed** (0 errors) |
| Unit tests | `npm test` | **Passed: 69/69** in 6 files (58 original + 2 transition + 9 live-data/open-palm) |
| Production build | `npm run build` | **Passed** (JS 304 kB / 97 kB gzip, CSS 13 kB) |
| Lint | n/a | **Not configured** (no ESLint in the project) |

### Browser tests (Playwright with installed Chrome, `PW_CHANNEL=chrome`)
| Suite | Result |
|---|---|
| `app.spec.ts`: startup, modal, Let's Go, sliders, colours, camera ON/DIM/Dark cycle, camera layer render, undo/clear/save PNG, accessibility, permission denied, no camera, unsupported browser, model/WASM failure, camera disconnect + reconnect, mobile layout | **Passed: 14/14** |
| `gestures.spec.ts`: draw follows fingertip, hand-lost stops the stroke, colour + thickness, glow halo, undo/clear, open-palm erase + split, pinch-move, fist never draws | **Passed: 8/8** |
| Optional real-image test (`HAND_Y4M` = real hand photo through the real MediaPipe model) | **Passed** |
| Total | **22 passed, 1 skipped** (the optional test is skipped unless `HAND_Y4M` is set; it passed when run separately) |

Playwright's bundled Chromium could not start in this environment (Windows side-by-side error), so all browser runs used the installed Google Chrome. Chrome's synthetic fake camera device stops after about 1.4 s here (even on a blank page), so tests use Chrome's file-backed fake camera (`--use-file-for-fake-video-capture`).

### Model and WASM loading
Network log from the production build: the model (`/models/hand_landmarker.task`) and the WASM runtime (`/mediapipe/wasm/*`) load from the app's own origin. The only third-party requests are Google Fonts. The CDN fallbacks were not needed. When the model and WASM requests are blocked, the app shows "Hand-tracking model failed to load" (tested).

### Live webcam testing (real camera, real person, with consent)
Three sessions, run in a visible Chrome window against the production build. An on-screen banner prompted each gesture.

**Session 1 (before fixes):** Draw ✅. Fist reached Idle, but passed through "Grab" on the way. **Open palm ❌** (shown as "Ready" throughout). Pinch → Grab ✅. **Final fist ❌** (stayed "Grab"). No console errors.

**Session 2: landmark recording** (coordinates only, no images). 278 labelled frames were recorded. Per-frame accuracy of the *old* classifier on steady-state frames: point 86%, open palm 35%, pinch 77%. The "fist" phase landmarks showed an extended index finger throughout, so that phase is not a valid fist sample and was excluded. Steady-state point, open-palm and pinch frames were saved as `tests/fixtures/live-webcam-landmarks.json`.

**Session 3 (after fixes):**
| Phase | HUD states observed | Canvas result |
|---|---|---|
| Draw | Drawing | ✅ 15,993 px drawn |
| Fist (all fingers curled) | Idle | ✅ |
| Open palm over the drawing | Idle → **Erasing** | ✅ painted pixels went from 16,427 to 3,067 (81% erased) |
| Pinch on a line and drag | Drawing → **Grab** | ✅ grabbed stroke highlighted |
| Fist to finish | Grab → **Idle** | ✅ the grabbed stroke was confirmed moved in the screenshots (centroid shifted ~230 px with nearly the same pixel count) |
| Console errors | none | ✅ |

### Visual comparison with https://air-draw-one.vercel.app/
The reference bundle was unchanged since the first inspection (same hashed assets). Both sites were captured with the same uniform camera feed at desktop 1440×900, tablet 820×1180 and mobile 390×844 (16 screenshot pairs) and pixel-diffed.

| State | Differing pixels (desktop / tablet / mobile) |
|---|---|
| Loading | 0.15% / 0.17% / 0.61%. The logo is a vector approximation, not the original raster. |
| How to Play modal | 0.01% / 0.02% / 0.05% (logo only) |
| Ready, Camera ON | 0.09% / 0.12% / 0.25% |
| Camera DIM | 0.09% / 0.12% / 0.25% |
| Dark Canvas | 0.09% / 0.11% / 0.25% |
| Mobile palette open | 0.17% |

The remaining differences are, in order: (1) the HUD label, which is intentional ("Show hand" when no hand is visible, where the reference shows "Ready"); (2) the pulsing ring around the selected swatch, which is an animation captured at different moments; (3) the logo approximation. No layout, spacing, colour or typography differences remain that are large enough to measure.

## 4. Known limitations
- **Live testing scope:** one person, one webcam, indoor lighting. Other hands, skin tones, lighting conditions and cameras have not been tested.
- **Fist geometry not validated from recorded data:** the recorded "fist" phase was not a valid fist sample. Fist → Idle was confirmed live in sessions 1 and 3 by the HUD, but there is no real-data unit fixture for it.
- **Pinch per-frame accuracy is 77%** on recorded frames. The 3-frame stabiliser smooths this, and live pinch-to-move worked, but a fast or partial pinch may need a moment to register.
- **Logo** is a vector approximation of the reference's raster logo, which was deliberately not copied.
- **Not tested:** Safari, Firefox and real mobile devices (mobile layout was tested only in emulated Chrome viewports).

## 5. Earlier audit (superseded)
The previous version of this file reported install, typecheck, tests, build, browser and webcam checks as blocked or not run, because its environment lacked npm registry access. All of those checks have now been run; the results are above.
