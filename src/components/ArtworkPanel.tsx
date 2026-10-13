import { useRef, useState } from "react";
import type { ArtworkMeta } from "../lib/artworkStore";
import { LineIcon } from "./Icons";
import { Panel } from "./Panel";

interface Props {
  artworks: ArtworkMeta[];
  storageAvailable: boolean;
  onSave: (name: string) => boolean;
  onRestore: (id: string) => void;
  onDelete: (meta: ArtworkMeta) => void;
  onExportPng: () => void;
  onExportProject: (name: string) => void;
  onImportFile: (file: File) => void;
  onClose: () => void;
}

const fmt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

/** Save/restore artworks locally, export PNG, export/import Veyra project files. */
export function ArtworkPanel(p: Props) {
  const [name, setName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <Panel id="artwork" title="Artwork" onClose={p.onClose}>
      <div className="panel-section">
        <label className="panel-label" htmlFor="artwork-name">
          Save to this browser
        </label>
        <div className="save-row">
          <input
            type="text"
            id="artwork-name"
            placeholder="Name your artwork"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && p.onSave(name)) setName("");
            }}
          />
          <button
            type="button"
            id="btn-artwork-save"
            className="btn-primary btn-small"
            onClick={() => {
              if (p.onSave(name)) setName("");
            }}
          >
            Save
          </button>
        </div>
        {!p.storageAvailable && (
          <p className="field-error">Browser storage is unavailable here. Use “Export project” instead.</p>
        )}
      </div>

      <div className="panel-section">
        <span className="panel-label">Saved artworks</span>
        {p.artworks.length === 0 ? (
          <p className="panel-hint" id="artwork-empty">
            No saved artworks yet.
          </p>
        ) : (
          <ul id="artwork-list" className="artwork-list">
            {p.artworks.map((a) => (
              <li key={a.id} className="artwork-item" data-id={a.id}>
                <div className="artwork-meta">
                  <strong>{a.name}</strong>
                  <small>
                    {fmt(a.savedAt)} · {a.strokeCount} {a.strokeCount === 1 ? "stroke" : "strokes"}
                  </small>
                </div>
                <div className="artwork-actions">
                  <button type="button" className="btn-secondary btn-small artwork-restore" onClick={() => p.onRestore(a.id)}>
                    Open
                  </button>
                  <button
                    type="button"
                    className="icon-btn artwork-delete"
                    aria-label={`Delete ${a.name}`}
                    title="Delete"
                    onClick={() => p.onDelete(a)}
                  >
                    <LineIcon name="trash" size={18} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel-section">
        <span className="panel-label">Export &amp; import</span>
        <div className="export-grid">
          <button type="button" id="btn-save" className="btn-secondary" onClick={p.onExportPng}>
            <LineIcon name="download" size={18} /> Export PNG
          </button>
          <button
            type="button"
            id="btn-export-project"
            className="btn-secondary"
            onClick={() => p.onExportProject(name)}
          >
            <LineIcon name="file" size={18} /> Export project
          </button>
          <button type="button" id="btn-import-project" className="btn-secondary" onClick={() => fileRef.current?.click()}>
            <LineIcon name="upload" size={18} /> Import project
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          id="import-file"
          accept=".json,.veyra.json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) p.onImportFile(f);
            e.target.value = "";
          }}
        />
        <p className="panel-hint">
          PNG contains only your artwork on the current background (transparent if selected). Project files (.veyra.json)
          keep every stroke editable.
        </p>
      </div>
    </Panel>
  );
}
