import { describe, expect, it } from "vitest";
import { ArtworkStore, INDEX_KEY, ITEM_PREFIX, STORAGE_ERRORS } from "../src/lib/artworkStore";
import type { KeyValueStorage } from "../src/lib/colors";
import { createProject } from "../src/lib/projectFile";
import type { Stroke } from "../src/types";

function memoryStorage(quotaBytes = Infinity): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  const used = () => [...data.values()].reduce((n, v) => n + v.length, 0);
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      const extra = v.length - (data.get(k)?.length ?? 0);
      if (used() + extra > quotaBytes) throw new DOMException("full", "QuotaExceededError");
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
}

const stroke: Stroke = { points: [{ x: 1, y: 2 }, { x: 3, y: 4 }], color: "#e0654d", thickness: 6, glow: 60, brush: "pen", opacity: 1 };
const project = (name: string, n = 1, when = "2026-10-13T10:00:00Z") =>
  createProject(name, Array.from({ length: n }, () => stroke), { width: 800, height: 600 }, "lavender", new Date(when));

describe("ArtworkStore", () => {
  it("saves, lists (newest first), loads and deletes artworks", () => {
    const store = new ArtworkStore(memoryStorage());
    const a = store.save(project("Morning", 2, "2026-10-13T08:00:00Z"));
    const b = store.save(project("Evening", 3, "2026-10-13T20:00:00Z"));
    expect(a.ok && b.ok).toBe(true);
    const list = store.list();
    expect(list.map((m) => m.name)).toEqual(["Evening", "Morning"]);
    expect(list[0].strokeCount).toBe(3);

    const loaded = store.load(list[1].id);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.value.name).toBe("Morning");
      expect(loaded.value.background).toBe("lavender");
      expect(loaded.value.strokes).toHaveLength(2);
    }

    expect(store.remove(list[1].id).ok).toBe(true);
    expect(store.list().map((m) => m.name)).toEqual(["Evening"]);
    expect(store.load(list[1].id)).toEqual({ ok: false, error: STORAGE_ERRORS.notFound });
  });

  it("refuses to save an empty drawing", () => {
    const store = new ArtworkStore(memoryStorage());
    expect(store.save(project("Empty", 0))).toEqual({ ok: false, error: STORAGE_ERRORS.empty });
  });

  it("reports quota errors without leaving orphaned data", () => {
    const storage = memoryStorage(400);
    const store = new ArtworkStore(storage);
    const r = store.save(project("Huge", 50));
    expect(r).toEqual({ ok: false, error: STORAGE_ERRORS.quota });
    expect([...storage.data.keys()].filter((k) => k.startsWith(ITEM_PREFIX))).toHaveLength(0);
    expect(store.list()).toEqual([]);
  });

  it("works without storage (private mode)", () => {
    const store = new ArtworkStore(null);
    expect(store.available).toBe(false);
    expect(store.list()).toEqual([]);
    expect(store.save(project("x"))).toEqual({ ok: false, error: STORAGE_ERRORS.unavailable });
  });

  it("survives a corrupted index and flags a corrupted artwork", () => {
    const storage = memoryStorage();
    storage.setItem(INDEX_KEY, "{not json");
    const store = new ArtworkStore(storage);
    expect(store.list()).toEqual([]);
    storage.setItem(ITEM_PREFIX + "bad", '{"format":"veyra-project","version":1}');
    expect(store.load("bad")).toEqual({ ok: false, error: STORAGE_ERRORS.corrupt });
  });
});
