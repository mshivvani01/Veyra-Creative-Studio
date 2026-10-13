import type { GestureIconName } from "../lib/constants";

// Veyra line icons: one consistent style (24px grid, 1.8 stroke, round caps).

const LINE_PATHS = {
  brush: "M4 20.5h5.5M14.6 4.9a2 2 0 0 1 2.8 0l1.7 1.7a2 2 0 0 1 0 2.8L9.5 19 5 20l1-4.5z",
  eraser:
    "M8.5 20h11M4.9 13.9l8-8a2 2 0 0 1 2.8 0l3.4 3.4a2 2 0 0 1 0 2.8L12 19.2H8.4L4.9 15.7a1.3 1.3 0 0 1 0-1.8zM9.3 9.6l5.1 5.1",
  shapes: "M4 4.5h7v7H4zM17.25 13a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM13.5 10.5 20 4M4 20l5-5",
  line: "M5 19 19 5",
  rect: "M4.5 6.5h15v11h-15z",
  circle: "M12 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15z",
  arrow: "M5 19 19 5M10.5 5H19v8.5",
  undo: "M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  redo: "M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13",
  trash: "M4 7h16M10 11v6M14 11v6M5.5 7l1 12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2l1-12M9 7V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V7",
  background: "M12 3 3 8l9 5 9-5-9-5zM3 12.5l9 5 9-5M3 17l9 5 9-5",
  camera:
    "M4 8.5a2 2 0 0 1 2-2h2l1.5-2h5l1.5 2h2a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM12 10a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  artwork: "M5 4h11l3 3v13H5zM8.5 4v5h6V4M8.5 20v-6h7v6",
  download: "M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14",
  upload: "M12 20V9M7.5 13.5 12 9l4.5 4.5M5 4.5h14",
  file: "M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5zM14 3.5v5h5M9 13h6M9 16.5h4",
  options: "M4 6.5h9M17 6.5h3M15 4.5v4M4 12h3M11 12h9M9 10v4M4 17.5h11M19 17.5h1M17 15.5v4",
  close: "M6 6l12 12M18 6 6 18",
  chevron: "M6 9l6 6 6-6",
  plus: "M12 5v14M5 12h14",
  check: "M5 12.5l4.5 4.5L19 7.5",
} as const;

export type LineIconName = keyof typeof LINE_PATHS;

export function LineIcon({ name, size = 20 }: { name: LineIconName; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={LINE_PATHS[name]} />
    </svg>
  );
}

// ---- Veyra gesture icons ----

const GESTURE_PATHS: Record<GestureIconName, string> = {
  // Draw: a pen tracing a line
  draw: LINE_PATHS.brush,
  // Erase: an eraser block
  erase: LINE_PATHS.eraser,
  // Move: four-way arrows
  move: "M12 3.5v17M3.5 12h17M12 3.5 9.5 6M12 3.5 14.5 6M12 20.5 9.5 18M12 20.5l2.5-2.5M3.5 12 6 9.5M3.5 12 6 14.5M20.5 12 18 9.5M20.5 12 18 14.5",
  // Idle: pause
  idle: "M9 6.5v11M15 6.5v11",
  // Ready: a soft target
  ready: "M12 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15zM12 11v2",
  // Show hand: camera framing corners
  show: "M4 8.5V6a2 2 0 0 1 2-2h2.5M15.5 4H18a2 2 0 0 1 2 2v2.5M20 15.5V18a2 2 0 0 1-2 2h-2.5M8.5 20H6a2 2 0 0 1-2-2v-2.5M12 10v4M10 12h4",
};

export function GestureIcon({ name, size = 20 }: { name: GestureIconName; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={GESTURE_PATHS[name]} />
    </svg>
  );
}
