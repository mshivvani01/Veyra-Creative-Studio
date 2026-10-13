/**
 * Veyra colour studio: curated palette, hex validation and recent colours.
 * Pure TypeScript (storage is injected) so it is fully unit-testable.
 */

export interface PaletteColor {
  value: string; // lowercase #rrggbb
  name: string;
}

export interface PaletteGroup {
  id: string;
  label: string;
  colors: PaletteColor[];
}

/** 36 curated colours in six groups of six. */
export const PALETTE: PaletteGroup[] = [
  {
    id: "essentials",
    label: "Essentials",
    colors: [
      { value: "#111111", name: "Black" },
      { value: "#36454f", name: "Charcoal" },
      { value: "#5a5a5a", name: "Dark gray" },
      { value: "#8c8279", name: "Warm gray" },
      { value: "#c9c9c9", name: "Light gray" },
      { value: "#ffffff", name: "White" },
    ],
  },
  {
    id: "reds",
    label: "Reds & pinks",
    colors: [
      { value: "#b3132f", name: "Crimson" },
      { value: "#e0301e", name: "Scarlet" },
      { value: "#e0654d", name: "Coral" },
      { value: "#d4477a", name: "Rose" },
      { value: "#ff3f9a", name: "Hot pink" },
      { value: "#f4b6c2", name: "Blush pink" },
    ],
  },
  {
    id: "warm",
    label: "Oranges & yellows",
    colors: [
      { value: "#e8701a", name: "Orange" },
      { value: "#f79a3e", name: "Tangerine" },
      { value: "#f2a900", name: "Amber" },
      { value: "#d4a017", name: "Golden yellow" },
      { value: "#fff44f", name: "Lemon yellow" },
      { value: "#f9b38c", name: "Peach" },
    ],
  },
  {
    id: "greens",
    label: "Greens",
    colors: [
      { value: "#7cc242", name: "Lime" },
      { value: "#8ee0bf", name: "Mint" },
      { value: "#87a878", name: "Sage" },
      { value: "#179e6a", name: "Emerald" },
      { value: "#1d5b36", name: "Forest green" },
      { value: "#707b2c", name: "Olive" },
    ],
  },
  {
    id: "blues",
    label: "Blues",
    colors: [
      { value: "#6cb4ee", name: "Sky blue" },
      { value: "#00b4d8", name: "Cyan" },
      { value: "#2ec4b6", name: "Turquoise" },
      { value: "#4169e1", name: "Royal blue" },
      { value: "#0047ab", name: "Cobalt" },
      { value: "#1b2a4e", name: "Navy" },
    ],
  },
  {
    id: "purples",
    label: "Purples",
    colors: [
      { value: "#b49ae8", name: "Lavender" },
      { value: "#c8a2c8", name: "Lilac" },
      { value: "#8b63d6", name: "Violet" },
      { value: "#5b2a86", name: "Deep purple" },
      { value: "#30223f", name: "Plum" },
      { value: "#e0218a", name: "Magenta" },
    ],
  },
];

export const ALL_COLORS: PaletteColor[] = PALETTE.flatMap((g) => g.colors);

/** Name of a curated colour, or the hex value for custom colours. */
export function colorName(hex: string): string {
  const v = hex.toLowerCase();
  return ALL_COLORS.find((c) => c.value === v)?.name ?? v.toUpperCase();
}

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isValidHex(input: string): boolean {
  return HEX_RE.test(input.trim());
}

/** "#ABC", "abc", "#aabbcc" → "#aabbcc". Returns null for invalid input. */
export function normalizeHex(input: string): string | null {
  const m = input.trim().match(HEX_RE);
  if (!m) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return `#${h}`;
}

// ------------------------------------------------------------ recent colours --

export const RECENT_KEY = "veyra:recent-colors";
export const RECENT_MAX = 12;

/** The subset of Storage that recent colours need (lets tests inject a fake). */
export type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function safeLocalStorage(): KeyValueStorage | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null; // e.g. blocked by privacy settings
  }
}

/** Reads recent colours, dropping anything that isn't a valid hex string. Never throws. */
export function loadRecentColors(storage: KeyValueStorage | null = safeLocalStorage()): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: string[] = [];
    for (const item of parsed) {
      if (typeof item !== "string") continue;
      const hex = normalizeHex(item);
      if (hex && !out.includes(hex)) out.push(hex);
      if (out.length >= RECENT_MAX) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Moves `color` to the front of the list (deduplicated, capped). Pure. */
export function addRecentColor(list: readonly string[], color: string): string[] {
  const hex = normalizeHex(color);
  if (!hex) return [...list];
  return [hex, ...list.filter((c) => c !== hex)].slice(0, RECENT_MAX);
}

/** Persists recent colours. Returns false if storage is unavailable or full. Never throws. */
export function saveRecentColors(list: readonly string[], storage: KeyValueStorage | null = safeLocalStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
    return true;
  } catch {
    return false;
  }
}
