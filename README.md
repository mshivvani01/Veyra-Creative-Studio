# Veyra 2.0

**Your hands. Your imagination. Your canvas.**

Veyra is a gesture-powered creative studio that turns natural hand movements into digital drawings. Point your index finger to draw, sweep an open palm to erase, pinch to grab and move a stroke, and close your fist to rest. You can also draw with a mouse, pen or touch. Hand tracking runs entirely in the browser with [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker). No video leaves your device.

Veyra 2.0 adds a full colour studio, five brushes, shapes, undo/redo, canvas backgrounds, local saving and project files, PNG export and keyboard shortcuts. The real webcam hand tracking and all four gestures are unchanged.

## Brand & theme

| | |
| --- | --- |
| Name | **Veyra** in running text, **VEYRA** as the wordmark |
| Tagline | *Your hands. Your imagination. Your canvas.* (loader, How to Play, page metadata) |
| Logo | `public/veyra-logo.svg` (mark + wordmark), `public/veyra-mark.svg` (symbol), `public/favicon.svg` (symbol on an ivory tile). An abstract pointing hand in plum, with a coral stroke flowing from the fingertip and a lavender spark. |
| Theme | **Light only.** Premium light editorial studio: warm ivory canvas, white surfaces, deep plum text and primary actions, lavender for selected states, coral accents, soft borders and restrained shadows. There is no dark theme, and every canvas background is light. |
| Type | [Fraunces](https://fonts.google.com/specimen/Fraunces) (serif) for headings and the tagline; [Inter](https://rsms.me/inter/) for the interface |

Design tokens are CSS custom properties at the top of `src/styles/global.css`:

| Token | Value | Use |
| --- | --- | --- |
| `--ivory` | `#F7F3EE` | page and canvas background |
| `--white` | `#FFFFFF` | panels, cards, buttons |
| `--plum` | `#30223F` | headings, primary text, primary button, slider thumbs |
| `--plum-2` | `#51465B` | secondary text and icons |
| `--muted` | `#796A87` | labels and captions (4.5:1 on ivory) |
| `--lavender` | `#C7A7F7` | hover borders, accents |
| `--lavender-strong` | `#8B63D6` | selected rings and focus outline (≥3:1) |
| `--lavender-surface` | `#EEE6F8` | selected and hover surfaces, slider tracks |
| `--coral` / `--coral-strong` | `#F29B86` / `#C4573F` | drawing accents |
| `--peach` | `#F9E7DF` | coral-tinted surface |
| `--border` | `#DED4E1` | hairline borders |
| `--success` | `#3B8B70` | camera-live dot |
| `--error` / `--error-text` | `#C94F58` / `#B8434D` | error borders and text, destructive buttons |

## The studio

The toolbar is a compact rail on the right (on phones, a scrollable bar along the bottom). Detailed settings open in panels beside it (bottom sheets on phones), so the canvas stays the focus.

| Rail button | What it does |
| --- | --- |
| Brush (`B`) | Freehand drawing with the selected brush |
| Eraser (`E`) | Erase by dragging (mouse/touch) or by pointing your index finger |
| Shapes | Line (`L`), Rectangle (`R`), Circle (`C`), Arrow (`A`) |
| Colour | Colour studio panel (see below) |
| Brush settings | Live brush preview; opens brush type, size, opacity, glow and eraser size |
| Undo / Redo | Disabled when there is nothing to undo or redo |
| Canvas background | Warm ivory, pure white, light lavender, pale peach, transparent |
| Toggle camera view | Camera On (35%) → Camera Dim (15%) → Canvas Only. Tracking keeps running and the drawing is never cleared. |
| Save, open & export | Local artwork library, PNG export, project-file export and import |
| Options & shortcuts | Hand guide on/off, sound on/off, pointer smoothing, shortcut list |
| Clear canvas (`Delete`) | Asks for confirmation first; undoable |

### Colour studio
- **36 curated colours** in six collapsible groups:
  - **Essentials:** Black, Charcoal, Dark gray, Warm gray, Light gray, White
  - **Reds & pinks:** Crimson, Scarlet, Coral, Rose, Hot pink, Blush pink
  - **Oranges & yellows:** Orange, Tangerine, Amber, Golden yellow, Lemon yellow, Peach
  - **Greens:** Lime, Mint, Sage, Emerald, Forest green, Olive
  - **Blues:** Sky blue, Cyan, Turquoise, Royal blue, Cobalt, Navy
  - **Purples:** Lavender, Lilac, Violet, Deep purple, Plum, Magenta
- **Custom colours:** the browser's native colour picker, plus a hex field. It accepts `#RGB` or `#RRGGBB`, with or without `#`; invalid input shows an error and leaves the colour unchanged.
- **Recent colours:** the last 12 picks, newest first and without duplicates, saved in `localStorage`. Corrupted or unavailable storage is handled safely.
- The active colour has a lavender ring. A new colour applies only to new strokes; every stroke keeps its own colour through undo, redo, move, save and export.

### Brushes
Each preset has its own renderer (`renderStroke` in `src/lib/drawingEngine.ts`):

| Brush | Rendering |
| --- | --- |
| Pen | One clean, solid pass |
| Marker | 1.6× wider and translucent (~72%), with a faint soft edge |
| Pencil | Thin graphite core plus two deterministic, jittered grain passes |
| Highlighter | 2.6× wider, flat caps, ~35% opacity |
| Neon | Wide halo + glow + core, scaled by the **Glow** setting (the original look; default brush) |
| Eraser | Removes drawing under the eraser; size adjustable (8–120 px) |

Settings:
- **Size:** 1–60 px, with XS, S, M, L and XL presets (2, 4, 8, 16, 32 px) and the exact value shown.
- **Opacity:** 10–100%.
- **Glow:** 0–100%, applies to the Neon brush.
- **Eraser size:** also used by the open-palm gesture.

Previews in the rail, the brush panel and on every brush tile use the real renderer and update live with brush, colour, size, opacity and glow. Brush settings are stored per stroke, so changing them never alters existing strokes.

### Shapes
Line, rectangle, circle (centre + radius) and arrow, in the current colour, size, brush and opacity.
- **Mouse/touch:** drag; the shape previews live and is placed on release.
- **Hand:** point with your index finger. The shape's end follows your fingertip and the shape is placed when you stop pointing (fist, open palm, or hand out of frame).

Shapes can be erased (removed whole when the eraser touches them), moved with a pinch, undone and redone.

### Undo, redo and clear
Every drawing operation is one history step: a stroke, a shape, one continuous erase pass (eraser tool or open palm), a pinch-move, a clear, or opening/importing an artwork. History holds up to 100 steps; snapshots share unchanged strokes, so memory stays small. Clear always asks for confirmation and can be undone.

### Backgrounds
The background is a separate layer behind the drawing (the `#app` background), so switching it never changes strokes. **Transparent** shows a checkerboard and exports PNGs with an alpha channel.

### Save, export and restore
- **Save to this browser:** name the artwork and save. It is stored as a structured Veyra project (strokes and settings, not a screenshot) in `localStorage`, one key per artwork plus a small index. You can open (undoable) or delete (with confirmation) saved artworks. Storage that is full or unavailable shows a clear message.
- **Export PNG** (`veyra-artwork-YYYY-MM-DD-HHMMSS.png`): only the artwork, on the selected background (transparent if chosen), at device resolution. It never includes the webcam, overlay or UI.
- **Export / import project** (`.veyra.json`):
  - Contains stroke coordinates, colours, brush, size, opacity, glow, shape type, canvas size and background.
  - Imported files are fully validated (format, version, numbers, colours, brushes, shapes and size limits) before anything is drawn. Malformed files show an error and leave the canvas untouched.
  - A drawing saved on a different screen size is scaled to fit and centred.

### Keyboard shortcuts
| Keys | Action |
| --- | --- |
| Ctrl/⌘ + Z | Undo |
| Ctrl/⌘ + Y, Ctrl/⌘ + Shift + Z | Redo |
| Delete / Backspace | Clear canvas (asks first) |
| B / E | Brush / Eraser |
| L / R / C / A | Line / Rectangle / Circle / Arrow |
| Esc | Close the open panel or dialog |

Shortcuts never fire while you type in a text field. Browser shortcuts such as Ctrl+C and Ctrl+R are left alone. The list also appears in **Options**.

### Hand-gesture experience
Draw (index finger), erase (open palm), move (pinch) and idle (fist) work as before:
- **Smoothing:** the pointer is smoothed, with strength adjustable under *Pointer smoothing* in Options; it changes the real smoother factor.
- **Clean transitions:** transition frames never draw, erase or move.
- **No stray lines:** when the hand leaves the frame, the stroke ends, and no connecting line appears when it returns.
- **Gapless erasing:** erasing sweeps continuously between frames, so fast movements leave no gaps.
- **Hand guide (optional):** the skeleton and fingertip pointer can be turned off in Options. They are drawn on an overlay and never painted into the artwork.

## Tech stack

- React 18, TypeScript 5, Vite 5 (no new runtime dependencies in 2.0)
- Plain CSS with CSS custom properties (`src/styles/global.css`)
- HTML Canvas 2D in three layers: camera / drawing / overlay. Committed strokes are cached on an offscreen canvas and redrawn only when the drawing changes.
- `@mediapipe/tasks-vision` 0.10.18 HandLandmarker
- Vitest for unit tests and Playwright for browser tests

There is no backend, account system or analytics. The only third-party request is Google Fonts (Fraunces and Inter).

## Prerequisites

- Node.js **18.18+** (developed with Node 22) and npm
- A webcam and a modern browser: Chrome, Edge, Firefox or Safari
- The page must be served over **HTTPS** or from `localhost`, because browsers only allow camera access in secure contexts.

## Install & run

```bash
npm install
npm run dev
```

Open the URL Vite prints (normally http://localhost:5173) and allow camera access.

`npm run dev` and `npm run build` first run `npm run assets`, which copies the MediaPipe WASM runtime from `node_modules` into `public/mediapipe/wasm/`.

## Build & preview

```bash
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/ at http://localhost:4173
```

## Tests

```bash
npm test                 # Vitest unit tests
npm run typecheck        # tsc --noEmit
npx playwright install chromium   # once, for browser tests
npm run test:e2e         # Playwright browser tests (builds and starts the preview server automatically)
```

**Unit tests (Vitest):**
- **Hands and gestures:** gesture classifier, coordinates, drawing engine and session. Synthetic hand fixtures are in `tests/fixtures/hands.ts`. `tests/liveLandmarks.test.ts` also checks the classifier against **real landmark coordinates recorded from a live webcam session** (one person, with consent; coordinates only, no images).
- **2.0 features:**
  - `colors.test.ts`: palette, hex validation, recent colours and storage failures
  - `history.test.ts`: undo/redo and memory cap
  - `projectFile.test.ts`: round-trip, malformed-file rejection and scaling
  - `artworkStore.test.ts`: save, list, open, delete, quota and corrupted data
  - `shortcuts.test.ts`: key mapping, text-field safety and export filename
  - `studio.test.ts`: distinct brushes, opacity, shapes, eraser, history across draw/erase/move/clear, pointer input, smoothing
  - `theme.test.ts`: brand, tokens, contrast, light-only backgrounds

**Browser tests (Playwright):**
- **Camera:** Chrome's file-backed fake camera (`tests/e2e/fixtures/blank-camera.y4m`) sends real frames through the real MediaPipe model, but there is no hand in them.
- **Hand gestures:** a scripted landmarker injected through `window.__AIR_DRAW_TEST_LANDMARKER__` returns synthetic poses. Nothing sets it in normal use.
- **Specs:**
  - `app.spec.ts`: startup, camera modes, controls, error states, mobile layout
  - `gestures.spec.ts`: hand drawing, erasing, pinch-move and idle, checked by canvas pixels
  - `branding.spec.ts`: title, favicon, logo, tagline, light theme, no creator credit
  - `studio.spec.ts`: every colour, custom/recent colours, distinct brushes, opacity, undo/redo/clear, backgrounds, shapes, PNG decoding, save/restore/delete, project export/import with malformed files, shortcuts, hand guide, mobile touch
- **Optional real-hand test:** set `HAND_Y4M` to a `.y4m` video containing a hand.
- **Browser choice:** set `PW_CHANNEL=chrome` or `PW_CHANNEL=msedge` to use an installed browser instead of Playwright's bundled Chromium.

The verified results are recorded in `IMPLEMENTATION_STATUS.md`.

## Project structure

```
src/
  App.tsx                     studio state, startup, controls, shortcuts, save/export wiring
  components/
    DrawingToolbar.tsx        the tool rail
    Panel.tsx                 popover / bottom-sheet container
    ColorPanel.tsx            curated palette, custom hex + picker, recent colours
    BrushPanel.tsx            brushes, size presets, opacity, glow, eraser size
    BrushPreview.tsx          live preview using the real renderer
    StudioPanels.tsx          shapes, background, options, confirm dialog, toast
    ArtworkPanel.tsx          save/open/delete, PNG + project export, import
    LoadingScreen, CameraPreview, DrawingCanvas, GestureHud, GestureInstructions,
    HeaderStatus (brand badge, camera pill), ErrorNotice, Icons
  hooks/
    useCamera.ts              getUserMedia lifecycle, cleanup, disconnect detection
    useHandTracking.ts        HandLandmarker load (idempotent) and close on unmount
    useAirDrawLoop.ts         rAF loop: camera paint, inference, cached rendering, overlay
  lib/
    airDrawSession.ts         DOM-free state machine: tools, hand + pointer input, history
    drawingEngine.ts          brush renderers, shapes, erase/split, grab, overlays, particles
    history.ts                undo/redo stack (capped, structurally shared)
    colors.ts                 palette, hex validation, recent colours
    projectFile.ts            Veyra project format, validation, scaling
    artworkStore.ts           localStorage artwork library with quota handling
    exportImage.ts            artwork-only PNG rendering, download, filenames
    shortcuts.ts              keyboard shortcut mapping
    gestureClassifier.ts      landmark → gesture, plus temporal stabiliser
    handCoordinates.ts        landmark indices, mirrored/cover mapping, smoothing
    handLandmarker.ts         asset URLs and local→CDN, GPU→CPU fallbacks
    constants.ts              brand, defaults, brushes, shapes, backgrounds, HUD
    errors.ts, sound.ts
  styles/global.css
public/
  veyra-logo.svg, veyra-mark.svg, favicon.svg
  models/hand_landmarker.task MediaPipe hand model (float16, ~7.8 MB)
scripts/copy-mediapipe-assets.mjs
tests/                        Vitest unit tests + tests/e2e Playwright specs
```

## How hand tracking works

1. **Camera:** `getUserMedia({ video: { width: 1280, height: 720, facingMode: "user" } })` feeds a hidden `<video>`. The visible camera image is painted mirrored onto `#camera-canvas` using *object-fit: cover*, so it fills any aspect ratio without stretching.
2. **Inference:** `HandLandmarker.detectForVideo()` runs once per **new** video frame (it compares against `video.currentTime`) inside a single `requestAnimationFrame` loop. The settings match the reference: 1 hand, VIDEO mode, detection and presence confidence 0.6, tracking confidence 0.5. If 30 inferences in a row fail, a "Hand tracking stopped" notice appears.
3. **Coordinates:** landmarks go through the same mirror-and-cover transform as the image, so the fingertip cursor sits exactly on your on-screen finger. The draw pointer uses an exponential moving average (factor 0.35 by default; adjustable with *Pointer smoothing* in Options, 0.6 → 0.1).
4. **Classification** (`gestureClassifier.ts`) works on scale- and rotation-invariant geometry:
   - A finger is *extended* when wrist→tip > 1.12 × wrist→PIP, and *curled* when wrist→tip < wrist→PIP.
   - **Pinch:** thumb–index tip distance / palm size < 0.33. Once pinching, the release threshold is 0.45 (hysteresis). Middle, ring and pinky must not be raised, and the index must reach beyond its knuckle, so a fist is never read as a pinch.
   - **Open palm:** all four fingers extended. The thumb may be spread or held against the hand; in live recordings most open palms were held with the thumb in.
   - **Draw:** index extended, middle curled, ring and pinky not raised.
   - **Fist:** no finger extended and middle and ring curled. Anything else counts as *idle*.
   - Detections with a handedness score below 0.5 are ignored.
5. **Stability:** a new gesture must be seen on 4 consecutive frames (3 for a pinch) before it becomes active. A lost hand switches immediately to "Show hand". During those transition frames nothing is drawn, erased or moved: the raw pose must agree with the active gesture. So curling into a fist never leaves a tail, and releasing a pinch never drags the stroke further. Every change out of draw mode commits the current stroke.
6. **Rendering:** strokes are stored as point lists in CSS pixels, each with its own colour, size, brush, opacity and (for shapes) shape type. Each brush has its own renderer (see *Brushes*); freehand strokes use quadratic smoothing, shapes straight outlines. Committed strokes are cached on an offscreen canvas. Canvases are sized for `devicePixelRatio` (capped at 2). Window resizes re-render from the stored strokes, so nothing is lost.

All thresholds are in `GESTURE_THRESHOLDS` and can be tuned there.

## Model & WASM assets

| Asset | Primary (local) | Fallback |
| --- | --- | --- |
| WASM runtime | `/mediapipe/wasm/` (copied by `npm run assets`) | `cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm` |
| Hand model | `/models/hand_landmarker.task` (included) | `storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task` |

The loader tries the GPU delegate first and falls back to CPU. No environment variables are needed. If you deploy under a sub-path, set Vite's `base` option; asset URLs follow `import.meta.env.BASE_URL`.

## Camera permissions

- The browser asks for permission on first load. If you click *Block*, the loader shows "Camera access required…". To fix it, allow the camera in the site settings (the padlock or camera icon in the address bar) and reload.
- The camera is released when you close or leave the page (`pagehide`) or when the app unmounts.
- If the camera is unplugged or taken by another app, a **Camera disconnected / Reconnect** notice appears. Your drawing is kept.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Camera access required" | Allow the camera for the site and reload. On macOS, also check System Settings → Privacy & Security → Camera for your browser. |
| "No camera found" / "in use by another app" | Connect a webcam, or close Zoom, Teams, OBS or similar apps. |
| "requires a secure (HTTPS) connection" | Use `localhost` or HTTPS. A LAN IP over plain HTTP is not allowed. |
| "Hand-tracking model failed to load" | Check that `public/models/hand_landmarker.task` exists and that `npm run assets` ran (`public/mediapipe/wasm/`). If both are missing, the CDN fallbacks need internet access. |
| Gestures flicker or are misread | Use even lighting, keep the whole hand in frame about 40–80 cm from the camera, and face your palm toward the camera. You can tune `GESTURE_THRESHOLDS`. |
| Laggy on older machines | The GPU delegate falls back to CPU automatically. Lower the browser zoom, or close other GPU-heavy tabs. |

## Deploying to Vercel

1. Push the project to a Git repository and import it into Vercel. It is detected as a **Vite** project.
2. The defaults work: build command `npm run build` (which also runs `prebuild` → `npm run assets`), output directory `dist`.
3. Vercel serves over HTTPS, so camera access works. No environment variables are required.

Or with the CLI: `npm i -g vercel && vercel --prod`.

## Known limitations

- **Live webcam:** testing covers one person, one webcam and indoor lighting. Draw, fist/idle, open-palm erase and pinch-to-move were each confirmed live in the 1.x sessions (see `IMPLEMENTATION_STATUS.md`). The 2.0 gesture code paths were verified with real camera frames, the real model on a real hand photo, and scripted poses. They were not re-checked with a live hand after this upgrade.
- **Browsers:** visual QA was done in Chrome at desktop, laptop, tablet and phone sizes. Safari and Firefox were not tested. The native colour picker looks different in each browser.
- **Local saves** live in this browser's `localStorage` (typically about 5 MB per site). Very large drawings may not fit; export a project file instead. Clearing site data deletes saved artworks.
- **Erasing shapes** removes the whole shape when the eraser touches its outline. Freehand strokes are split precisely.
- **Mobile toolbar:** on narrow phones the toolbar scrolls sideways to reach every tool.
- **Camera toggle:** changes only the camera *view* (On / Dim / Canvas Only). The webcam keeps running, because tracking needs it.
- **Hands:** one hand is tracked (`numHands: 1`).

## Attribution & licences

- Veyra's brand, logo, theme and the rebrand changes are new work in this project.
- The underlying app recreates **[Air Draw](https://air-draw-one.vercel.app/)**, original concept and design by [designs.bhupesh](https://www.instagram.com/designs.bhupesh/). The rebrand is not affiliated with or endorsed by them.
- [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe) and the `hand_landmarker.task` model: © Google, Apache License 2.0.
- Icons and the Veyra logo were drawn for this project.
- Fonts: [Fraunces](https://fonts.google.com/specimen/Fraunces) and [Inter](https://rsms.me/inter/), SIL Open Font License 1.1, loaded from Google Fonts.
- React, Vite, Vitest and Playwright: MIT / Apache-2.0, per their packages.
