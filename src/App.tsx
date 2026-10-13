import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ArtworkPanel } from "./components/ArtworkPanel";
import { BrushPanel, type BrushState } from "./components/BrushPanel";
import { CameraPreview } from "./components/CameraPreview";
import { ColorPanel } from "./components/ColorPanel";
import { DrawingCanvas } from "./components/DrawingCanvas";
import { DrawingToolbar } from "./components/DrawingToolbar";
import { ErrorNotice } from "./components/ErrorNotice";
import { GestureHud } from "./components/GestureHud";
import { GestureInstructions } from "./components/GestureInstructions";
import { BrandBadge, CameraModeIndicator } from "./components/HeaderStatus";
import { LoadingScreen, type LoaderState } from "./components/LoadingScreen";
import type { PanelId } from "./components/Panel";
import {
  BackgroundPanel,
  ConfirmDialog,
  OptionsPanel,
  ShapesPanel,
  Toast,
  type ConfirmRequest,
  type ToastMessage,
} from "./components/StudioPanels";
import { useAirDrawLoop, type LoopSettings } from "./hooks/useAirDrawLoop";
import { useCamera } from "./hooks/useCamera";
import { useHandTracking } from "./hooks/useHandTracking";
import { AirDrawSession, isShapeTool } from "./lib/airDrawSession";
import { ArtworkStore, type ArtworkMeta } from "./lib/artworkStore";
import { addRecentColor, loadRecentColors, safeLocalStorage, saveRecentColors } from "./lib/colors";
import { DEFAULTS, GESTURE_HUD, INITIAL_HUD, NEXT_CAMERA_MODE, backgroundById, type HudState } from "./lib/constants";
import type { Particle } from "./lib/drawingEngine";
import { ERROR_MESSAGES, toInitError } from "./lib/errors";
import { canvasToBlob, downloadBlob, exportFilename, renderArtwork } from "./lib/exportImage";
import { createProject, parseProject, projectStrokesFor, type VeyraProject } from "./lib/projectFile";
import { matchShortcut } from "./lib/shortcuts";
import { setSoundEnabled, sounds } from "./lib/sound";
import type { BackgroundId, BrushType, CameraMode, Point, Tool } from "./types";

interface RuntimeError {
  message: string;
  action: "reconnect" | "reload";
}

interface StudioSettings {
  showPointer: boolean;
  smoothing: number;
  sound: boolean;
  background: BackgroundId;
}

const SETTINGS_KEY = "veyra:settings";
const MAX_IMPORT_BYTES = 15 * 1024 * 1024;

function loadSettings(): StudioSettings {
  const fallback: StudioSettings = {
    showPointer: true,
    smoothing: DEFAULTS.smoothing,
    sound: true,
    background: DEFAULTS.background,
  };
  try {
    const raw = safeLocalStorage()?.getItem(SETTINGS_KEY);
    if (!raw) return fallback;
    const s = JSON.parse(raw) as Partial<StudioSettings>;
    return {
      showPointer: typeof s.showPointer === "boolean" ? s.showPointer : fallback.showPointer,
      smoothing: typeof s.smoothing === "number" && s.smoothing >= 0 && s.smoothing <= 100 ? s.smoothing : fallback.smoothing,
      sound: typeof s.sound === "boolean" ? s.sound : fallback.sound,
      background: backgroundById(s.background as BackgroundId).id,
    };
  } catch {
    return fallback;
  }
}

const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });

export default function App() {
  // DOM refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const uiCanvasRef = useRef<HTMLCanvasElement>(null);

  // Mutable engine state read by the render loop (never triggers React renders).
  const sessionRef = useRef(new AirDrawSession());
  const cameraModeRef = useRef<CameraMode>("on");
  const dirtyRef = useRef(true);
  const particlesRef = useRef<Particle[]>([]);
  const pointerRef = useRef<Point | null>(null);
  const initialSettings = useMemo(loadSettings, []);
  const loopSettingsRef = useRef<LoopSettings>({ showPointer: initialSettings.showPointer });
  const store = useMemo(() => new ArtworkStore(), []);

  // UI state
  const [loader, setLoader] = useState<LoaderState>("loading");
  const [loaderGone, setLoaderGone] = useState(false);
  const [initError, setInitError] = useState("");
  const [trackingReady, setTrackingReady] = useState(false);
  const [appVisible, setAppVisible] = useState(false);
  const [modalOpen, setModalOpen] = useState(true);
  const [hud, setHud] = useState<HudState>(INITIAL_HUD);
  const [cameraMode, setCameraMode] = useState<CameraMode>("on");
  const [runtimeError, setRuntimeError] = useState<RuntimeError | null>(null);

  const [tool, setToolState] = useState<Tool>("brush");
  const [brush, setBrush] = useState<BrushState>({
    color: DEFAULTS.color,
    thickness: DEFAULTS.thickness,
    glow: DEFAULTS.glow,
    brush: DEFAULTS.brush,
    opacity: DEFAULTS.opacity,
    eraserSize: DEFAULTS.eraserSize,
  });
  const [recent, setRecent] = useState<string[]>(() => loadRecentColors());
  const [openPanel, setOpenPanel] = useState<PanelId | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [background, setBackgroundState] = useState<BackgroundId>(initialSettings.background);
  const [showPointer, setShowPointer] = useState(initialSettings.showPointer);
  const [smoothing, setSmoothing] = useState(initialSettings.smoothing);
  const [sound, setSound] = useState(initialSettings.sound);
  const [artworks, setArtworks] = useState<ArtworkMeta[]>(() => store.list());

  const camera = useCamera(videoRef);
  const tracking = useHandTracking();
  const bgOption = backgroundById(background);

  // ---- Feedback
  const toastTimer = useRef(0);
  const notify = useCallback((text: string, tone: ToastMessage["tone"] = "info") => {
    window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text, tone });
    toastTimer.current = window.setTimeout(() => setToast(null), tone === "error" ? 6000 : 3200);
  }, []);

  // ---- Session wiring: history state + persisted settings
  useEffect(() => {
    const session = sessionRef.current;
    session.setSmoothing(initialSettings.smoothing);
    setSoundEnabled(initialSettings.sound);
    let last = { canUndo: false, canRedo: false };
    session.onChange = () => {
      const next = { canUndo: session.canUndo, canRedo: session.canRedo };
      if (next.canUndo !== last.canUndo || next.canRedo !== last.canRedo) {
        last = next;
        setHistory(next);
      }
    };
    return () => {
      session.onChange = null;
    };
  }, [initialSettings]);

  useEffect(() => {
    try {
      safeLocalStorage()?.setItem(SETTINGS_KEY, JSON.stringify({ showPointer, smoothing, sound, background }));
    } catch {
      /* settings persistence is best-effort */
    }
  }, [showPointer, smoothing, sound, background]);

  const handleDisconnect = useCallback(() => {
    const session = sessionRef.current;
    session.endStroke();
    session.endGrab();
    session.stabilizer.reset("none");
    dirtyRef.current = true;
    setHud(GESTURE_HUD.none);
    setRuntimeError({ message: ERROR_MESSAGES.disconnected, action: "reconnect" });
  }, []);

  // ---- Startup: camera + model in parallel.
  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    (async () => {
      try {
        await Promise.all([tracking.load(), camera.start(handleDisconnect)]);
        if (cancelled) return;
        setTrackingReady(true);
        setLoader("complete");
        timers.push(
          window.setTimeout(() => {
            setLoader("fading");
            setAppVisible(true);
          }, 600),
          window.setTimeout(() => setLoaderGone(true), 1200),
        );
      } catch (err) {
        if (cancelled) return;
        camera.stop();
        const e = toInitError(err);
        console.error("Failed to initialize Veyra:", e.cause ?? e);
        setInitError(e.message);
        setLoader("error");
      }
    })();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
    // Run once on mount; camera/tracking callbacks are stable.
  }, []);

  useAirDrawLoop(
    trackingReady,
    {
      video: videoRef,
      cameraCanvas: cameraCanvasRef,
      drawingCanvas: drawingCanvasRef,
      uiCanvas: uiCanvasRef,
      landmarker: tracking.landmarkerRef,
      session: sessionRef,
      cameraMode: cameraModeRef,
      dirty: dirtyRef,
      particles: particlesRef,
      settings: loopSettingsRef,
      pointer: pointerRef,
    },
    {
      onGestureChange: (g) => setHud(GESTURE_HUD[g]),
      onTrackingError: () => setRuntimeError({ message: ERROR_MESSAGES.tracking, action: "reload" }),
    },
  );

  // ---- Brush, colour & tools
  const updateBrush = (patch: Partial<BrushState>) => {
    setBrush((b) => {
      const next = { ...b, ...patch };
      Object.assign(sessionRef.current.brush, next);
      return next;
    });
  };
  const setTool = (t: Tool) => {
    sessionRef.current.setTool(t);
    setToolState(t);
    dirtyRef.current = true;
  };
  const onColor = (hex: string, remember = true) => {
    updateBrush({ color: hex });
    if (remember) {
      setRecent((list) => {
        const next = addRecentColor(list, hex);
        saveRecentColors(next);
        return next;
      });
      sounds.color();
    }
  };
  const onBrushType = (b: BrushType) => {
    updateBrush({ brush: b });
    if (!isShapeTool(tool)) setTool("brush");
  };

  // ---- History & canvas
  const onUndo = () => {
    if (sessionRef.current.undo()) {
      dirtyRef.current = true;
      sounds.undo();
    }
  };
  const onRedo = () => {
    if (sessionRef.current.redo()) {
      dirtyRef.current = true;
      sounds.undo();
    }
  };
  const requestClear = () => {
    if (sessionRef.current.strokes.length === 0 && !sessionRef.current.currentStroke) {
      notify("The canvas is already empty.");
      return;
    }
    setConfirm({
      title: "Clear the canvas?",
      message: "This removes every stroke from the canvas. You can bring it back with Undo.",
      confirmLabel: "Clear canvas",
      onConfirm: () => {
        sessionRef.current.clear();
        particlesRef.current = [];
        dirtyRef.current = true;
        sounds.clear();
        notify("Canvas cleared. Press Ctrl+Z to undo.");
      },
    });
  };
  const onBackground = (b: BackgroundId) => setBackgroundState(backgroundById(b).id);
  const onToggleCamera = () => {
    const next = NEXT_CAMERA_MODE[cameraModeRef.current];
    cameraModeRef.current = next;
    setCameraMode(next);
    sounds.toggle();
  };

  // ---- Save / export / import
  const applyProject = (project: VeyraProject, verb: string) => {
    sessionRef.current.replaceStrokes(projectStrokesFor(project, viewport()));
    onBackground(project.background);
    dirtyRef.current = true;
    notify(`${verb} “${project.name}”. Undo returns to your previous drawing.`);
  };
  const onSaveArtwork = (name: string): boolean => {
    const session = sessionRef.current;
    session.endStroke();
    const project = createProject(name, session.strokes, viewport(), background);
    const res = store.save(project);
    if (!res.ok) {
      notify(res.error, "error");
      return false;
    }
    setArtworks(store.list());
    notify(`Saved “${res.value.name}” in this browser.`);
    sounds.confirm();
    return true;
  };
  const onRestoreArtwork = (id: string) => {
    const res = store.load(id);
    if (!res.ok) {
      notify(res.error, "error");
      return;
    }
    applyProject(res.value, "Opened");
  };
  const onDeleteArtwork = (meta: ArtworkMeta) => {
    setConfirm({
      title: "Delete this artwork?",
      message: `“${meta.name}” will be removed from this browser. This cannot be undone.`,
      confirmLabel: "Delete",
      onConfirm: () => {
        const res = store.remove(meta.id);
        if (!res.ok) notify(res.error, "error");
        else notify(`Deleted “${meta.name}”.`);
        setArtworks(store.list());
      },
    });
  };
  const onExportPng = async () => {
    const strokes = sessionRef.current.strokes;
    if (strokes.length === 0) {
      notify("Nothing to export yet. Draw something first.", "error");
      return;
    }
    try {
      const canvas = renderArtwork(strokes, viewport(), bgOption.color, Math.min(window.devicePixelRatio || 1, 2));
      downloadBlob(await canvasToBlob(canvas), exportFilename());
      sounds.confirm();
      notify(bgOption.color ? "PNG exported." : "PNG exported with a transparent background.");
    } catch (e) {
      console.error("[veyra] PNG export failed", e);
      notify("Couldn't export the image. Please try again.", "error");
    }
  };
  const onExportProject = (name: string) => {
    const strokes = sessionRef.current.strokes;
    if (strokes.length === 0) {
      notify("Nothing to export yet. Draw something first.", "error");
      return;
    }
    const project = createProject(name, strokes, viewport(), background);
    downloadBlob(
      new Blob([JSON.stringify(project)], { type: "application/json" }),
      exportFilename(new Date(), "veyra.json"),
    );
    notify("Project file exported.");
  };
  const onImportFile = async (file: File) => {
    if (file.size > MAX_IMPORT_BYTES) {
      notify("That file is too large to be a Veyra project.", "error");
      return;
    }
    try {
      const res = parseProject(await file.text());
      if (!res.ok) {
        notify(`Couldn't open the file: ${res.error}`, "error");
        return;
      }
      applyProject(res.project, "Imported");
    } catch {
      notify("Couldn't read that file.", "error");
    }
  };

  // ---- Mouse / touch drawing on the canvas
  const toPoint = (e: { clientX: number; clientY: number }, el: Element): Point => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (openPanel || confirm) return; // the first tap just closes an open panel
    const session = sessionRef.current;
    const p = toPoint(e, e.currentTarget);
    pointerRef.current = p;
    if (!session.pointerDown(p)) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dirtyRef.current = true;
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const session = sessionRef.current;
    const el = e.currentTarget;
    pointerRef.current = toPoint(e, el);
    if (!session.isPointerDrawing) return;
    // Coalesced events give every sample between frames: smoother fast strokes.
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const ev of events.length ? events : [e.nativeEvent]) session.pointerMove(toPoint(ev, el));
    dirtyRef.current = true;
  };
  const onPointerUp = () => {
    const session = sessionRef.current;
    if (!session.isPointerDrawing) return;
    session.pointerUp();
    dirtyRef.current = true;
  };
  const onPointerLeave = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!sessionRef.current.isPointerDrawing || e.pointerType !== "mouse") pointerRef.current = null;
  };

  // ---- Keyboard shortcuts (attached once; reads the latest state via a ref)
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => undefined);
  keyHandler.current = (e: KeyboardEvent) => {
    const action = matchShortcut(e);
    if (!action) return;
    if (action.type === "escape") {
      if (confirm) setConfirm(null);
      else if (openPanel) setOpenPanel(null);
      return;
    }
    // Not while the onboarding card or a confirmation is showing.
    if (modalOpen || !appVisible || confirm) return;
    switch (action.type) {
      case "undo":
        e.preventDefault();
        onUndo();
        break;
      case "redo":
        e.preventDefault();
        onRedo();
        break;
      case "clear":
        e.preventDefault();
        requestClear();
        break;
      case "tool":
        setTool(action.tool);
        break;
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onStart = () => {
    setModalOpen(false);
    sessionRef.current.start();
    sounds.confirm();
    // Reflect the real tracking state ("Show hand" when no hand is visible).
    setHud(GESTURE_HUD[sessionRef.current.gesture]);
  };
  const onRuntimeAction = () => {
    if (runtimeError?.action === "reload") {
      window.location.reload();
      return;
    }
    camera
      .start(handleDisconnect)
      .then(() => setRuntimeError(null))
      .catch((err) =>
        setRuntimeError({ message: toInitError(err).message.replace(/^Error:\s*/, ""), action: "reconnect" }),
      );
  };

  const togglePanel = (id: PanelId) => setOpenPanel((cur) => (cur === id ? null : id));
  const closePanel = useCallback(() => setOpenPanel(null), []);
  const toolClass = tool === "eraser" ? "tool-eraser" : isShapeTool(tool) ? "tool-shape" : "tool-brush";

  return (
    <>
      {!loaderGone && <LoadingScreen state={loader} errorMessage={initError} />}

      <main
        id="app"
        className={`${appVisible ? "" : "hidden "}bg-${background}`}
        style={bgOption.color ? { background: bgOption.color } : undefined}
        aria-hidden={!appVisible || modalOpen}
      >
        <h1 className="visually-hidden">Veyra — gesture drawing studio</h1>
        <CameraPreview videoRef={videoRef} canvasRef={cameraCanvasRef} />
        <DrawingCanvas
          drawingRef={drawingCanvasRef}
          uiRef={uiCanvasRef}
          toolClass={toolClass}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
        />
        <GestureHud hud={hud} />
        <DrawingToolbar
          tool={tool}
          color={brush.color}
          brush={brush.brush}
          thickness={brush.thickness}
          opacity={brush.opacity}
          glow={brush.glow}
          eraserSize={brush.eraserSize}
          cameraMode={cameraMode}
          openPanel={openPanel}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onTool={setTool}
          onTogglePanel={togglePanel}
          onUndo={onUndo}
          onRedo={onRedo}
          onClear={requestClear}
          onToggleCamera={onToggleCamera}
        />

        {openPanel === "color" && <ColorPanel color={brush.color} recent={recent} onColor={onColor} onClose={closePanel} />}
        {openPanel === "brush" && (
          <BrushPanel
            state={brush}
            tool={tool}
            background={bgOption.color}
            onBrush={onBrushType}
            onEraser={() => setTool("eraser")}
            onChange={updateBrush}
            onClose={closePanel}
          />
        )}
        {openPanel === "shapes" && <ShapesPanel tool={tool} onTool={setTool} onClose={closePanel} />}
        {openPanel === "background" && (
          <BackgroundPanel background={background} onBackground={onBackground} onClose={closePanel} />
        )}
        {openPanel === "artwork" && (
          <ArtworkPanel
            artworks={artworks}
            storageAvailable={store.available}
            onSave={onSaveArtwork}
            onRestore={onRestoreArtwork}
            onDelete={onDeleteArtwork}
            onExportPng={onExportPng}
            onExportProject={onExportProject}
            onImportFile={onImportFile}
            onClose={closePanel}
          />
        )}
        {openPanel === "options" && (
          <OptionsPanel
            showPointer={showPointer}
            smoothing={smoothing}
            sound={sound}
            onShowPointer={(v) => {
              setShowPointer(v);
              loopSettingsRef.current.showPointer = v;
            }}
            onSmoothing={(v) => {
              setSmoothing(v);
              sessionRef.current.setSmoothing(v);
            }}
            onSound={(v) => {
              setSound(v);
              setSoundEnabled(v);
            }}
            onClose={closePanel}
          />
        )}

        <div id="top-bar">
          <BrandBadge />
          <CameraModeIndicator mode={cameraMode} onClick={onToggleCamera} />
        </div>
        {runtimeError && (
          <ErrorNotice
            message={runtimeError.message}
            actionLabel={runtimeError.action === "reload" ? "Reload" : "Reconnect"}
            onAction={onRuntimeAction}
          />
        )}
        <Toast toast={toast} />
      </main>

      {confirm && <ConfirmDialog request={confirm} onCancel={() => setConfirm(null)} />}
      {appVisible && modalOpen && <GestureInstructions onStart={onStart} />}
    </>
  );
}
