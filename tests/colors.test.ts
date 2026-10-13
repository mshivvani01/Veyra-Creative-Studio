import { describe, expect, it } from "vitest";
import {
  ALL_COLORS,
  PALETTE,
  RECENT_KEY,
  RECENT_MAX,
  addRecentColor,
  colorName,
  isValidHex,
  loadRecentColors,
  normalizeHex,
  saveRecentColors,
  type KeyValueStorage,
} from "../src/lib/colors";

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

describe("curated palette", () => {
  it("has at least 32 colours, all valid, distinct #rrggbb values", () => {
    expect(ALL_COLORS.length).toBeGreaterThanOrEqual(32);
    for (const c of ALL_COLORS) expect(c.value).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(ALL_COLORS.map((c) => c.value)).size).toBe(ALL_COLORS.length);
  });

  it("contains every requested named colour, grouped", () => {
    const names = ALL_COLORS.map((c) => c.name);
    for (const n of [
      "Black", "White", "Light gray", "Dark gray", "Charcoal", "Warm gray",
      "Crimson", "Scarlet", "Coral", "Rose", "Hot pink", "Blush pink",
      "Orange", "Tangerine", "Amber", "Golden yellow", "Lemon yellow", "Peach",
      "Lime", "Mint", "Sage", "Emerald", "Forest green", "Olive",
      "Sky blue", "Cyan", "Turquoise", "Royal blue", "Cobalt", "Navy",
      "Lavender", "Lilac", "Violet", "Deep purple", "Plum", "Magenta",
    ]) {
      expect(names).toContain(n);
    }
    expect(PALETTE.map((g) => g.label)).toEqual([
      "Essentials",
      "Reds & pinks",
      "Oranges & yellows",
      "Greens",
      "Blues",
      "Purples",
    ]);
  });

  it("names curated colours and falls back to the hex for custom ones", () => {
    expect(colorName("#E0654D")).toBe("Coral");
    expect(colorName("#123456")).toBe("#123456");
  });
});

describe("hex validation", () => {
  it.each([
    ["#e0654d", "#e0654d"],
    ["E0654D", "#e0654d"],
    ["#ABC", "#aabbcc"],
    ["abc", "#aabbcc"],
    ["  #00FF00 ", "#00ff00"],
  ])("normalizes %s → %s", (input, out) => {
    expect(isValidHex(input)).toBe(true);
    expect(normalizeHex(input)).toBe(out);
  });

  it.each(["", "#", "#12", "#1234", "#12345", "#1234567", "#ggg000", "red", "rgb(0,0,0)", "##abc"])(
    "rejects %s",
    (input) => {
      expect(isValidHex(input)).toBe(false);
      expect(normalizeHex(input)).toBeNull();
    },
  );
});

describe("recent colours", () => {
  it("adds to the front, removes duplicates and caps the list", () => {
    let list: string[] = [];
    list = addRecentColor(list, "#111111");
    list = addRecentColor(list, "#222222");
    list = addRecentColor(list, "#111111");
    expect(list).toEqual(["#111111", "#222222"]);
    for (let i = 0; i < 20; i++) list = addRecentColor(list, `#0000${String(i).padStart(2, "0")}`);
    expect(list).toHaveLength(RECENT_MAX);
    expect(addRecentColor(list, "not a colour")).toEqual(list);
  });

  it("persists to and restores from storage", () => {
    const storage = memoryStorage();
    expect(saveRecentColors(["#aabbcc", "#e0654d"], storage)).toBe(true);
    expect(loadRecentColors(storage)).toEqual(["#aabbcc", "#e0654d"]);
  });

  it("handles corrupted or hostile stored values safely", () => {
    expect(loadRecentColors(memoryStorage({ [RECENT_KEY]: "{not json" }))).toEqual([]);
    expect(loadRecentColors(memoryStorage({ [RECENT_KEY]: '{"a":1}' }))).toEqual([]);
    expect(
      loadRecentColors(memoryStorage({ [RECENT_KEY]: JSON.stringify(["#ABC", 5, null, "javascript:x", "#aabbcc", "#abc"]) })),
    ).toEqual(["#aabbcc"]);
  });

  it("never throws when storage is unavailable or full", () => {
    expect(loadRecentColors(null)).toEqual([]);
    expect(saveRecentColors(["#aabbcc"], null)).toBe(false);
    const throwing: KeyValueStorage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
      removeItem: () => undefined,
    };
    expect(loadRecentColors(throwing)).toEqual([]);
    expect(saveRecentColors(["#aabbcc"], throwing)).toBe(false);
  });
});
