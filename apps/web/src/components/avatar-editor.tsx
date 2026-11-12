"use client";
import { useEffect, useRef, useState } from "react";
import {
  AVATAR_OPTIONS,
  AVATAR_LABELS,
  generateAvatar,
  avatarOrFallback,
  type AvatarAttribute,
} from "@circle/avatar-engine";
import type { AvatarSpec, AvatarRecord } from "@circle/shared-types";
import Avatar from "./avatar";
import { api } from "./identity-panel";
export function AvatarEditor({
  initial,
  defaultSeed,
  onSave,
  onCancel,
  cancelLabel = "Cancel",
}: {
  initial: AvatarSpec;
  defaultSeed?: string;
  onSave: (value: AvatarSpec) => Promise<void> | void;
  onCancel: () => void;
  cancelLabel?: string;
}) {
  const safe = avatarOrFallback(initial),
    [value, setValue] = useState<AvatarSpec>({
      version: 1,
      seed: safe.seed,
      config: { ...safe.config },
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="avatar-editor-dialog"
      aria-label="Avatar customization"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <header className="avatar-editor-heading">
        <h2>Make your avatar yours.</h2>
        <p>See every change as you choose.</p>
      </header>
      <section className="avatar-editor" aria-label="Avatar editor">
        <div className="avatar-editor-main">
          <div className="avatar-editor-preview-panel">
            <div className="avatar-editor-preview">
              <Avatar avatar={value} size={224} label="Avatar preview" />
              <span>One you. Every circle.</span>
            </div>
            <div className="avatar-editor-tools">
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => {
                  let next: AvatarSpec;
                  do {
                    next = generateAvatar(crypto.randomUUID());
                  } while (
                    JSON.stringify(next.config) === JSON.stringify(value.config)
                  );
                  setValue(next);
                }}
              >
                Generate Again
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() =>
                  setValue(generateAvatar(defaultSeed ?? initial.seed))
                }
              >
                Reset avatar
              </button>
            </div>
          </div>
          <div
            className="avatar-editor-options"
            role="region"
            aria-label="Avatar options"
            tabIndex={0}
          >
            {(Object.keys(AVATAR_OPTIONS) as AvatarAttribute[]).map((key) => (
              <label key={key}>
                {AVATAR_LABELS[key]}
                <select
                  aria-label={AVATAR_LABELS[key]}
                  value={value.config[key]}
                  disabled={busy}
                  onChange={(e) =>
                    setValue((v) => ({
                      ...v,
                      config: { ...v.config, [key]: e.target.value },
                    }))
                  }
                >
                  {AVATAR_OPTIONS[key].map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
        {error && (
          <p role="alert" className="flow-error">
            {error}
          </p>
        )}
        <footer className="avatar-editor-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await onSave(value);
              } catch (e) {
                setError(
                  (e as { status?: number }).status === 409
                    ? "Your avatar changed on another device. Cancel and reopen the editor to load it."
                    : (e as Error).message,
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Saving…" : "Save avatar"}
          </button>
        </footer>
      </section>
    </dialog>
  );
}
export default function AvatarSettings({
  onSaved,
}: {
  onSaved: () => Promise<void> | void;
}) {
  const [record, setRecord] = useState<AvatarRecord | null>(null),
    [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [saved, setSaved] = useState(false);
  return (
    <div className="avatar-settings">
      <button
        type="button"
        className="secondary"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          setError("");
          setSaved(false);
          try {
            setRecord(await api<AvatarRecord>("avatars/me"));
            setOpen(true);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setLoading(false);
          }
        }}
      >
        {loading ? "Opening avatar…" : "Customize avatar"}
      </button>
      {saved && <p role="status">Avatar saved across all your communities.</p>}
      {error && <p role="alert">{error}</p>}
      <div className="avatar-downloads">
        <a href="/api/v1/avatars/me/export/svg" download="circle-avatar.svg">
          Download SVG
        </a>
        <a href="/api/v1/avatars/me/export/png" download="circle-avatar.png">
          Download PNG
        </a>
      </div>
      {open && record && (
        <div className="avatar-settings-panel">
          <AvatarEditor
            initial={record}
            defaultSeed={record.defaultSeed}
            onCancel={() => setOpen(false)}
            onSave={async (value) => {
              const updated = await api<AvatarRecord>("avatars/me", "PATCH", {
                version: 1,
                seed: value.seed,
                config: value.config,
                revision: record.revision,
              });
              setRecord(updated);
              await onSaved();
              setOpen(false);
              setSaved(true);
            }}
          />
        </div>
      )}
    </div>
  );
}
