import type { Stroke } from "../types";

/**
 * Undo/redo history of drawing operations.
 *
 * Each entry is the stroke list *before* an operation (draw, erase pass, move,
 * shape, clear, restore). Stroke lists are replaced rather than mutated by the
 * session, so consecutive snapshots share unchanged stroke objects and memory
 * stays proportional to what actually changed. History is capped.
 */
export class StrokeHistory {
  private past: Stroke[][] = [];
  private future: Stroke[][] = [];

  readonly limit: number;

  constructor(limit = 100) {
    this.limit = limit;
  }

  /** Records the state before an operation and invalidates redo. */
  record(before: readonly Stroke[]): void {
    this.past.push(before.slice());
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  /** Returns the state to restore, or null when there is nothing to undo. */
  undo(current: readonly Stroke[]): Stroke[] | null {
    const prev = this.past.pop();
    if (!prev) return null;
    this.future.push(current.slice());
    return prev;
  }

  redo(current: readonly Stroke[]): Stroke[] | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(current.slice());
    return next;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get size(): number {
    return this.past.length;
  }

  reset(): void {
    this.past = [];
    this.future = [];
  }
}

/** Deep copy of a stroke (used before mutating a stroke in place, e.g. while moving it). */
export function cloneStroke(s: Stroke): Stroke {
  return { ...s, points: s.points.map((p) => ({ x: p.x, y: p.y })) };
}
