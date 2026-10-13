import { describe, expect, it } from "vitest";
import { StrokeHistory, cloneStroke } from "../src/lib/history";
import type { Stroke } from "../src/types";

const s = (x: number): Stroke => ({ points: [{ x, y: 0 }, { x: x + 1, y: 0 }], color: "#000000", thickness: 4, glow: 0 });

describe("StrokeHistory", () => {
  it("undoes and redoes multiple sequential operations", () => {
    const h = new StrokeHistory();
    let state: Stroke[] = [];
    const op = (next: Stroke[]) => {
      h.record(state);
      state = next;
    };
    op([s(1)]);
    op([s(1), s(2)]);
    op([s(1), s(2), s(3)]);
    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(false);

    state = h.undo(state)!;
    state = h.undo(state)!;
    expect(state).toHaveLength(1);
    expect(h.canRedo).toBe(true);

    state = h.redo(state)!;
    expect(state).toHaveLength(2);
    state = h.redo(state)!;
    expect(state).toHaveLength(3);
    expect(h.redo(state)).toBeNull();
  });

  it("clears redo when a new operation happens after undo", () => {
    const h = new StrokeHistory();
    h.record([]);
    const undone = h.undo([s(1)])!;
    expect(h.canRedo).toBe(true);
    h.record(undone);
    expect(h.canRedo).toBe(false);
  });

  it("returns null when there is nothing to undo", () => {
    expect(new StrokeHistory().undo([])).toBeNull();
  });

  it("caps memory at the configured limit, dropping the oldest entries", () => {
    const h = new StrokeHistory(5);
    for (let i = 0; i < 12; i++) h.record([s(i)]);
    expect(h.size).toBe(5);
    let state: Stroke[] = [];
    let last: Stroke[] = [];
    while (h.canUndo) last = state = h.undo(state)!;
    expect(last[0].points[0].x).toBe(7); // entries 0..6 were dropped
  });

  it("snapshots are independent of later array mutation", () => {
    const h = new StrokeHistory();
    const arr = [s(1)];
    h.record(arr);
    arr.push(s(2));
    expect(h.undo([])!).toHaveLength(1);
  });

  it("cloneStroke deep-copies points", () => {
    const a = s(1);
    const b = cloneStroke(a);
    b.points[0].x = 99;
    expect(a.points[0].x).toBe(1);
  });
});
