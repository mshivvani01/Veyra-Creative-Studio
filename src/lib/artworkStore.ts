import type { KeyValueStorage } from "./colors";
import { safeLocalStorage } from "./colors";
import { parseProject, type VeyraProject } from "./projectFile";

/**
 * Local artwork library in localStorage.
 *
 * Artworks are stored as structured Veyra projects (strokes + settings, not
 * screenshots), one key per artwork plus a small index, so listing never has
 * to parse every drawing. Storage errors (unavailable, quota exceeded) are
 * returned as results, never thrown.
 */
export const INDEX_KEY = "veyra:artworks";
export const ITEM_PREFIX = "veyra:artwork:";

export interface ArtworkMeta {
  id: string;
  name: string;
  savedAt: string;
  strokeCount: number;
  bytes: number;
}

export type StoreResult<T> = { ok: true; value: T } | { ok: false; error: string };

export const STORAGE_ERRORS = {
  unavailable: "Browser storage is unavailable (private mode or blocked). Export a project file instead.",
  quota: "Not enough browser storage. Delete an older artwork or export this one as a project file.",
  notFound: "That artwork could not be found.",
  corrupt: "That saved artwork is damaged and can't be opened.",
  empty: "There is nothing to save yet. Draw something first.",
} as const;

function isQuotaError(e: unknown): boolean {
  const err = e as { name?: string; code?: number } | null;
  return (
    !!err &&
    (err.name === "QuotaExceededError" ||
      err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      err.code === 22 ||
      err.code === 1014)
  );
}

export class ArtworkStore {
  private storage: KeyValueStorage | null;

  constructor(storage: KeyValueStorage | null = safeLocalStorage()) {
    this.storage = storage;
  }

  get available(): boolean {
    return this.storage !== null;
  }

  /** Lists saved artworks, newest first. Invalid index entries are ignored. */
  list(): ArtworkMeta[] {
    if (!this.storage) return [];
    try {
      const raw = this.storage.getItem(INDEX_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (m): m is ArtworkMeta =>
            !!m &&
            typeof m === "object" &&
            typeof m.id === "string" &&
            typeof m.name === "string" &&
            typeof m.savedAt === "string" &&
            typeof m.strokeCount === "number",
        )
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    } catch {
      return [];
    }
  }

  save(project: VeyraProject): StoreResult<ArtworkMeta> {
    if (!this.storage) return { ok: false, error: STORAGE_ERRORS.unavailable };
    if (project.strokes.length === 0) return { ok: false, error: STORAGE_ERRORS.empty };
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const data = JSON.stringify(project);
    const meta: ArtworkMeta = {
      id,
      name: project.name,
      savedAt: project.savedAt,
      strokeCount: project.strokes.length,
      bytes: data.length,
    };
    try {
      this.storage.setItem(ITEM_PREFIX + id, data);
      try {
        this.storage.setItem(INDEX_KEY, JSON.stringify([meta, ...this.list()]));
      } catch (e) {
        this.storage.removeItem(ITEM_PREFIX + id); // don't leave an orphan behind
        throw e;
      }
      return { ok: true, value: meta };
    } catch (e) {
      return { ok: false, error: isQuotaError(e) ? STORAGE_ERRORS.quota : STORAGE_ERRORS.unavailable };
    }
  }

  load(id: string): StoreResult<VeyraProject> {
    if (!this.storage) return { ok: false, error: STORAGE_ERRORS.unavailable };
    let raw: string | null;
    try {
      raw = this.storage.getItem(ITEM_PREFIX + id);
    } catch {
      return { ok: false, error: STORAGE_ERRORS.unavailable };
    }
    if (!raw) return { ok: false, error: STORAGE_ERRORS.notFound };
    const parsed = parseProject(raw);
    return parsed.ok ? { ok: true, value: parsed.project } : { ok: false, error: STORAGE_ERRORS.corrupt };
  }

  remove(id: string): StoreResult<true> {
    if (!this.storage) return { ok: false, error: STORAGE_ERRORS.unavailable };
    try {
      this.storage.removeItem(ITEM_PREFIX + id);
      this.storage.setItem(INDEX_KEY, JSON.stringify(this.list().filter((m) => m.id !== id)));
      return { ok: true, value: true };
    } catch {
      return { ok: false, error: STORAGE_ERRORS.unavailable };
    }
  }
}
