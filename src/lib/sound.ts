// Tiny Web Audio "blips" that give feedback on gesture changes and button
// presses, mirroring the reference app. All calls are best-effort: if audio
// is unavailable or blocked by autoplay policy they silently do nothing.

type Wave = OscillatorType;

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

let enabled = true;

/** Turns all sound effects on or off. */
export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

export function tone(freq: number, duration: number, type: Wave = "sine", volume = 0.06): void {
  if (!enabled) return;
  try {
    const ac = audio();
    if (!ac) return;
    if (ac.state === "suspended") void ac.resume().catch(() => undefined);
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    gain.gain.setValueAtTime(volume, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + duration);
  } catch {
    /* audio is optional */
  }
}

export const sounds = {
  drawStart: () => tone(880, 0.08, "sine", 0.04),
  drawEnd: () => tone(440, 0.1, "sine", 0.03),
  erase: () => tone(200, 0.06, "triangle", 0.03),
  grab: () => tone(660, 0.1, "sine", 0.05),
  drop: () => tone(330, 0.15, "sine", 0.04),
  toggle: () => tone(1200, 0.05, "sine", 0.03),
  color: () => tone(1000, 0.05, "sine", 0.03),
  undo: () => tone(500, 0.08, "sine", 0.03),
  clear: () => tone(300, 0.15, "triangle", 0.04),
  confirm: () => tone(800, 0.1, "sine", 0.04),
};

export function closeAudio(): void {
  if (ctx) {
    void ctx.close().catch(() => undefined);
    ctx = null;
  }
}
