"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import type {
  ThemeConfig,
  ThemeDraft,
  SavedTheme,
  ThemeState,
  ThemeLibrary,
} from "@circle/shared-types";
import {
  DEFAULT_THEME,
  THEME_PALETTES,
  THEME_COLOR_LABELS,
  themeBackgroundDataUri,
  themeContrastIssues,
} from "@circle/design-tokens";
import { ONBOARDING_BACKGROUNDS } from "@circle/constants";
import { api } from "./identity-panel";
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const initial: ThemeDraft = {
  name: "My Circle",
  description: "",
  config: clone(DEFAULT_THEME),
};
const tabs = [
  "Backgrounds",
  "Colors",
  "Gradients",
  "Patterns",
  "Components",
  "Typography",
  "Effects",
] as const;
function HexInput({
  label,
  color,
  onChange,
}: {
  label: string;
  color: string;
  onChange: (v: string) => void;
}) {
  const [entry, setEntry] = useState({ source: color, text: color });
  const text = entry.source === color ? entry.text : color;
  return (
    <input
      aria-label={label}
      value={text}
      maxLength={7}
      onChange={(e) => {
        setEntry({ source: color, text: e.target.value });
        if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value);
      }}
      onBlur={() => setEntry({ source: color, text: color })}
    />
  );
}
function ThemePreview({ config: t }: { config: ThemeConfig }) {
  const [page, setPage] = useState("Feed"),
    [device, setDevice] = useState("Mobile"),
    [liked, setLiked] = useState(false);
  const c = t.colors;
  return (
    <section className="theme-preview-column" aria-label="Live theme preview">
      <div className="theme-preview-toolbar">
        <strong>Live preview</strong>
        <div>
          {["Mobile", "Desktop"].map((x) => (
            <button
              type="button"
              aria-pressed={device === x}
              key={x}
              onClick={() => setDevice(x)}
            >
              {x}
            </button>
          ))}
        </div>
      </div>
      <div
        className={`theme-preview-frame ${device === "Desktop" ? "wide" : ""}`}
        style={
          {
            backgroundColor: c.primaryBackground,
            backgroundImage: `url("${themeBackgroundDataUri(t)}")`,
            color: c.primaryText,
            fontFamily:
              t.typography.family === "system"
                ? "system-ui"
                : t.typography.family === "rounded"
                  ? "var(--font-heading)"
                  : "var(--font-body)",
            fontSize: t.typography.baseSize,
            lineHeight: t.typography.lineHeight,
            borderRadius: t.effects.radius,
            boxShadow: t.effects.shadows ? "0 18px 60px #0005" : "none",
          } as CSSProperties
        }
      >
        {t.background.type === "image" && t.background.imageId && (
          <Image
            className="theme-preview-image"
            unoptimized
            fill
            src={`/api/v1/media/${t.background.imageId}`}
            alt=""
            sizes="500px"
            style={{
              opacity: t.background.opacity * t.background.intensity * 0.15,
              objectFit: "cover",
            }}
          />
        )}
        <div className="theme-preview-content">
          <header>
            <b>
              Circle<span style={{ color: "#FF6A00" }}>.social</span>
            </b>
            <span aria-hidden="true">⌕ ♧</span>
          </header>
          <nav
            style={{
              background: c.navigationBackground,
              borderRadius: t.effects.radius,
            }}
          >
            {["Feed", "Community", "Profile", "Post"].map((x) => (
              <button
                type="button"
                key={x}
                style={{
                  background: page === x ? c.navigationActive : "transparent",
                  color: page === x ? c.buttonText : c.primaryText,
                  borderRadius: t.effects.radius,
                }}
                onClick={() => setPage(x)}
              >
                {x}
              </button>
            ))}
          </nav>
          {page === "Feed" && (
            <>
              <h3>For you. For your people.</h3>
              <article
                style={{
                  background: c.surface,
                  borderColor: c.border,
                  borderRadius: t.effects.radius,
                }}
              >
                <small style={{ color: c.secondaryAccent }}>
                  Bhasar · Just now
                </small>
                <h4>quiet_otter_4821</h4>
                <p>
                  Some days are just better with good people and great
                  conversations.
                </p>
                <div
                  className="theme-preview-art"
                  style={{
                    background: `linear-gradient(135deg,${c.secondaryBackground},${c.secondaryAccent})`,
                    borderRadius: t.effects.radius,
                  }}
                >
                  Real people.
                  <br />
                  Open conversations.
                </div>
                <button
                  type="button"
                  style={{ color: c.primaryAccent }}
                  onClick={() => setLiked(!liked)}
                  aria-pressed={liked}
                >
                  {liked ? "♥" : "♡"} {liked ? 25 : 24} · Join the conversation
                </button>
              </article>
            </>
          )}
          {page === "Community" && (
            <>
              <h3>Your circles</h3>
              <article
                style={{
                  background: c.surface,
                  borderColor: c.border,
                  borderRadius: t.effects.radius,
                }}
              >
                <h4>Bhasar</h4>
                <p>A space for everyday voices and open conversations.</p>
                <button
                  type="button"
                  style={{
                    background: c.primaryAccent,
                    color: c.buttonText,
                    borderRadius: t.effects.radius,
                  }}
                  onClick={(e) => {
                    e.currentTarget.textContent =
                      e.currentTarget.textContent === "Join"
                        ? "Joined"
                        : "Join";
                  }}
                >
                  Join
                </button>
              </article>
            </>
          )}
          {page === "Profile" && (
            <article
              style={{
                background: c.surface,
                borderColor: c.border,
                borderRadius: t.effects.radius,
              }}
            >
              <div
                className="theme-preview-avatar"
                style={{ background: c.secondaryBackground }}
              >
                ◉
              </div>
              <h3>quiet_otter_4821</h3>
              <p style={{ color: c.secondaryText }}>
                A new voice in the conversation.
              </p>
              <button type="button" style={{ color: c.primaryAccent }}>
                Edit profile
              </button>
            </article>
          )}
          {page === "Post" && (
            <>
              <h3>Share a thought</h3>
              <textarea
                aria-label="Preview post"
                placeholder="What’s on your mind?"
                style={{
                  background: c.inputBackground,
                  color: c.primaryText,
                  border: `1px solid ${c.inputBorder}`,
                  borderRadius: t.effects.radius,
                }}
              />
              <button
                type="button"
                style={{
                  background: c.primaryAccent,
                  color: c.buttonText,
                  borderRadius: t.effects.radius,
                }}
              >
                Post preview
              </button>
            </>
          )}
          <p style={{ color: c.secondaryText }}>
            Your words. Your people. Your Circle.
          </p>
          <footer
            style={{
              background: c.navigationBackground,
              color: c.secondaryText,
              borderColor: c.border,
            }}
          >
            ⌂ Feed　 ◇ Discover　 ♧ Communities　 ◉ Profile
          </footer>
        </div>
      </div>
      <small>Interactive preview · Nothing here is published</small>
    </section>
  );
}
export default function ThemeSettings({
  onApplied,
}: {
  onApplied: () => Promise<void>;
}) {
  const [library, setLibrary] = useState<ThemeLibrary | null>(null),
    [state, setState] = useState<ThemeState | null>(null),
    [open, setOpen] = useState(false),
    [editing, setEditing] = useState<SavedTheme | null>(null),
    [draft, setDraft] = useState<ThemeDraft>(initial),
    [undo, setUndo] = useState<ThemeDraft[]>([]),
    [redo, setRedo] = useState<ThemeDraft[]>([]),
    [section, setSection] = useState<(typeof tabs)[number]>("Backgrounds"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [deleted, setDeleted] = useState<{ id: string; revision: number } | null>(
      null,
    );
  const dialog = useRef<HTMLDialogElement>(null);
  async function load() {
    const [l, s] = await Promise.all([
      api<ThemeLibrary>("themes"),
      api<ThemeState>("themes/state"),
    ]);
    setLibrary(l);
    setState(s);
  }
  useEffect(() => {
    let live = true;
    void Promise.all([
      api<ThemeLibrary>("themes"),
      api<ThemeState>("themes/state"),
    ])
      .then(([l, s]) => {
        if (live) {
          setLibrary(l);
          setState(s);
        }
      })
      .catch(() => {
        if (live) setMessage("Could not load themes. Try again.");
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    dialog.current?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, [open]);
  function change(next: ThemeDraft) {
    setUndo((x) => [...x.slice(-49), clone(draft)]);
    setRedo([]);
    setDraft(next);
    setMessage("");
  }
  function config(next: ThemeConfig) {
    change({ ...draft, config: next });
  }
  function start(theme: SavedTheme | null) {
    setEditing(theme);
    setDraft(
      theme
        ? {
            name: theme.name,
            description: theme.description,
            config: clone(theme.config),
          }
        : clone(initial),
    );
    setUndo([]);
    setRedo([]);
    setMessage("");
    setOpen(true);
  }
  async function perform(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch (error) {
      if ((error as { status?: number }).status === 409)
        await load().catch(() => {});
      setMessage(
        error instanceof Error
          ? error.message
          : "Theme could not be saved. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save(apply = false) {
    const saved = await api<SavedTheme>(
      editing ? `themes/${editing.id}` : "themes",
      editing ? "PATCH" : "POST",
      { ...draft, ...(editing ? { revision: editing.revision } : {}) },
    );
    setEditing(saved);
    setUndo([]);
    setRedo([]);
    if (apply) {
      const fresh = await api<ThemeState>("themes/state");
      setState(
        await api<ThemeState>(`themes/${saved.id}/apply`, "POST", {
          themeVersion: fresh.themeVersion,
        }),
      );
      await onApplied();
    }
    await load();
    setMessage(
      apply
        ? "Theme saved and applied across your app."
        : "Theme saved. Apply it when you’re ready.",
    );
  }
  const t = draft.config,
    issues = themeContrastIssues(t),
    canSave =
      !busy &&
      !issues.length &&
      draft.name.trim().length > 0 &&
      (t.background.type !== "image" || !!t.background.imageId);
  const colorControl = (key: keyof ThemeConfig["colors"]) => (
    <label className="theme-color" key={key}>
      {THEME_COLOR_LABELS[key]}
      <span>
        <input
          aria-label={`${THEME_COLOR_LABELS[key]} color picker`}
          type="color"
          value={t.colors[key]}
          onChange={(e) =>
            config({ ...t, colors: { ...t.colors, [key]: e.target.value } })
          }
        />
        <HexInput
          label={`${THEME_COLOR_LABELS[key]} HEX`}
          color={t.colors[key]}
          onChange={(value) =>
            config({ ...t, colors: { ...t.colors, [key]: value } })
          }
        />
      </span>
    </label>
  );
  const range = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (v: number) => void,
  ) => (
    <label className="theme-range">
      {label}
      <output>{value}</output>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
  return (
    <section className="theme-settings">
      <h3>App themes</h3>
      <p className="muted">
        Your whole Circle, your way. Existing backgrounds stay available.
      </p>
      <div className="theme-library-grid">
        {ONBOARDING_BACKGROUNDS.map((bg) => (
          <button
            type="button"
            key={bg.id}
            disabled={busy}
            className="theme-library-card"
            aria-pressed={
              !state?.activeTheme && state?.defaultBackgroundId === bg.id
            }
            onClick={() =>
              void perform(async () => {
                const fresh = await api<ThemeState>("themes/state");
                setState(
                  await api<ThemeState>("themes/default", "POST", {
                    themeVersion: fresh.themeVersion,
                    backgroundId: bg.id,
                  }),
                );
                await onApplied();
                setMessage("Default appearance restored.");
              })
            }
          >
            <Image src={bg.path} alt="" width={180} height={100} />
            <strong>{bg.label}</strong>
          </button>
        ))}
        <button
          type="button"
          className="theme-library-card theme-create"
          onClick={() => start(null)}
        >
          ＋ Create Your Own Theme
        </button>
      </div>
      {library?.items?.map((item) => (
        <div className="theme-saved-row" key={item.id}>
          <span>
            <b>{item.name}</b>
            {state?.activeTheme?.id === item.id ? " · Active" : ""}
            {!item.supported ? " · Unsupported version" : ""}
            <small>{item.description}</small>
          </span>
          <button
            type="button"
            disabled={busy || !item.supported}
            onClick={() => start(item)}
          >
            Edit
          </button>
          <button
            type="button"
            disabled={busy || !item.supported}
            onClick={() =>
              void perform(async () => {
                await api(`themes/${item.id}/duplicate`, "POST", {});
                await load();
              })
            }
          >
            Duplicate
          </button>
          <button
            type="button"
            disabled={busy || !item.supported}
            onClick={() =>
              void perform(async () => {
                const fresh = await api<ThemeState>("themes/state");
                setState(
                  await api<ThemeState>(`themes/${item.id}/apply`, "POST", {
                    themeVersion: fresh.themeVersion,
                  }),
                );
                await onApplied();
                setMessage("Theme applied.");
              })
            }
          >
            Apply
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                setDeleted(
                  await api(`themes/${item.id}`, "DELETE", {
                    revision: item.revision,
                  }),
                );
                await load();
                await onApplied();
              })
            }
          >
            Delete
          </button>
        </div>
      ))}
      {library && (
        <small>
          {Math.round((library.bytesUsed ?? 0) / 1024)} KB of{" "}
          {(library.byteLimit ?? 2097152) / 1024 / 1024} MB theme storage
        </small>
      )}
      {deleted && (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void perform(async () => {
              await api(`themes/${deleted.id}/restore`, "POST", {
                revision: deleted.revision,
              });
              setDeleted(null);
              await load();
            })
          }
        >
          Undo delete
        </button>
      )}
      {!open && message && <p role="status">{message}</p>}
      {open && (
        <dialog
          ref={dialog}
          onCancel={(e) => {
            e.preventDefault();
            if (!busy) setOpen(false);
          }}
          className="theme-studio"
          role="dialog"
          aria-modal="true"
          aria-label="Custom App Theme Studio"
          onKeyDown={(e) => {
            if (e.key === "Escape" && !busy) setOpen(false);
          }}
        >
          <header className="theme-studio-header">
            <div>
              <small>CIRCLE.SOCIAL</small>
              <h2>Theme Studio</h2>
            </div>
            <span>Style your space. Keep your voice.</span>
            <button
              autoFocus
              type="button"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Close studio
            </button>
          </header>
          <div className="theme-studio-body">
            <aside className="theme-controls" inert={busy}>
              <nav aria-label="Theme control categories">
                {tabs.map((x) => (
                  <button
                    type="button"
                    key={x}
                    aria-pressed={section === x}
                    onClick={() => setSection(x)}
                  >
                    {x}
                  </button>
                ))}
              </nav>
              <div className="theme-control-scroll">
                <h3>{section}</h3>
                {section === "Backgrounds" && (
                  <>
                    <label>
                      Background type
                      <select
                        value={t.background.type}
                        onChange={(e) =>
                          config({
                            ...t,
                            background: {
                              ...t.background,
                              type: e.target
                                .value as ThemeConfig["background"]["type"],
                            },
                          })
                        }
                      >
                        {[
                          "solid",
                          "linear",
                          "radial",
                          "pattern",
                          "texture",
                          "image",
                        ].map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </label>
                    {colorControl("primaryBackground")}
                    {range("Opacity", t.background.opacity, 0, 1, 0.05, (v) =>
                      config({
                        ...t,
                        background: { ...t.background, opacity: v },
                      }),
                    )}
                    {range(
                      "Intensity",
                      t.background.intensity,
                      0,
                      1,
                      0.05,
                      (v) =>
                        config({
                          ...t,
                          background: { ...t.background, intensity: v },
                        }),
                    )}
                    {t.background.type === "image" && (
                      <label>
                        Upload background image
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          disabled={busy}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file)
                              void perform(async () => {
                                if (file.size > 12 * 1024 * 1024)
                                  throw new Error(
                                    "Choose an image under 12 MB.",
                                  );
                                const response = await fetch("/api/v1/media", {
                                  method: "POST",
                                  headers: { "Content-Type": file.type },
                                  body: file,
                                });
                                if (!response.ok)
                                  throw new Error(
                                    "Image upload failed. Choose a PNG, JPEG or WebP under 12 MB.",
                                  );
                                const media = (await response.json()).data;
                                config({
                                  ...t,
                                  background: {
                                    ...t.background,
                                    imageId: media.id,
                                  },
                                });
                              });
                          }}
                        />
                        <small>
                          Images are softened to protect readability. Maximum 12
                          MB.
                        </small>
                      </label>
                    )}
                  </>
                )}
                {(section === "Colors" || section === "Components") && (
                  <>
                    {section === "Colors" && (
                      <div className="theme-palettes">
                        {THEME_PALETTES.map((p) => (
                          <button
                            type="button"
                            key={p.id}
                            onClick={() => config(clone(p.config))}
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                    )}
                    {(
                      Object.keys(
                        THEME_COLOR_LABELS,
                      ) as (keyof ThemeConfig["colors"])[]
                    )
                      .filter(
                        (k) =>
                          section === "Colors" ||
                          [
                            "surface",
                            "border",
                            "inputBackground",
                            "inputBorder",
                            "navigationBackground",
                            "navigationActive",
                            "buttonText",
                          ].includes(k),
                      )
                      .map(colorControl)}
                  </>
                )}
                {section === "Gradients" && (
                  <>
                    <label>
                      Gradient style
                      <select
                        value={
                          t.background.type === "radial" ? "radial" : "linear"
                        }
                        onChange={(e) =>
                          config({
                            ...t,
                            background: {
                              ...t.background,
                              type: e.target.value as "linear" | "radial",
                            },
                          })
                        }
                      >
                        <option>linear</option>
                        <option>radial</option>
                      </select>
                    </label>
                    {range("Direction", t.background.angle, 0, 360, 1, (v) =>
                      config({
                        ...t,
                        background: {
                          ...t.background,
                          type:
                            t.background.type === "radial"
                              ? "radial"
                              : "linear",
                          angle: v,
                        },
                      }),
                    )}
                    {t.background.stops.map((stop, i) => (
                      <div className="theme-stop" key={i}>
                        <label>
                          Stop {i + 1}
                          <input
                            aria-label={`Stop ${i + 1} color`}
                            type="color"
                            value={stop.color}
                            onChange={(e) =>
                              config({
                                ...t,
                                background: {
                                  ...t.background,
                                  type:
                                    t.background.type === "radial"
                                      ? "radial"
                                      : "linear",
                                  stops: t.background.stops.map((s, n) =>
                                    n === i
                                      ? { ...s, color: e.target.value }
                                      : s,
                                  ),
                                },
                              })
                            }
                          />
                        </label>
                        {range(
                          `Stop ${i + 1} position`,
                          stop.position,
                          0,
                          100,
                          1,
                          (v) =>
                            config({
                              ...t,
                              background: {
                                ...t.background,
                                stops: t.background.stops.map((s, n) =>
                                  n === i ? { ...s, position: v } : s,
                                ),
                              },
                            }),
                        )}
                        <button
                          type="button"
                          disabled={t.background.stops.length <= 2}
                          onClick={() =>
                            config({
                              ...t,
                              background: {
                                ...t.background,
                                stops: t.background.stops.filter(
                                  (_, n) => n !== i,
                                ),
                              },
                            })
                          }
                        >
                          Remove stop
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      disabled={t.background.stops.length >= 5}
                      onClick={() =>
                        config({
                          ...t,
                          background: {
                            ...t.background,
                            type: "linear",
                            stops: [
                              ...t.background.stops,
                              {
                                color: t.colors.primaryBackground,
                                position: 50,
                              },
                            ],
                          },
                        })
                      }
                    >
                      Add gradient stop
                    </button>
                  </>
                )}
                {section === "Patterns" && (
                  <>
                    {(["dots", "grid", "waves", "grain"] as const).map(
                      (pattern) => (
                        <button
                          type="button"
                          key={pattern}
                          aria-pressed={t.background.pattern === pattern}
                          onClick={() =>
                            config({
                              ...t,
                              background: {
                                ...t.background,
                                type:
                                  pattern === "grain" ? "texture" : "pattern",
                                pattern,
                              },
                            })
                          }
                        >
                          {pattern}
                        </button>
                      ),
                    )}
                    {range(
                      "Pattern intensity",
                      t.background.intensity,
                      0,
                      1,
                      0.05,
                      (v) =>
                        config({
                          ...t,
                          background: { ...t.background, intensity: v },
                        }),
                    )}
                  </>
                )}
                {section === "Typography" && (
                  <>
                    <label>
                      Font family
                      <select
                        value={t.typography.family}
                        onChange={(e) =>
                          config({
                            ...t,
                            typography: {
                              ...t.typography,
                              family: e.target
                                .value as ThemeConfig["typography"]["family"],
                            },
                          })
                        }
                      >
                        <option value="inter">Inter</option>
                        <option value="system">System</option>
                        <option value="rounded">Chillax rounded</option>
                      </select>
                    </label>
                    {range("Text size", t.typography.baseSize, 14, 18, 1, (v) =>
                      config({
                        ...t,
                        typography: { ...t.typography, baseSize: v },
                      }),
                    )}
                    {range(
                      "Line height",
                      t.typography.lineHeight,
                      1.35,
                      1.8,
                      0.05,
                      (v) =>
                        config({
                          ...t,
                          typography: { ...t.typography, lineHeight: v },
                        }),
                    )}
                  </>
                )}
                {section === "Effects" && (
                  <>
                    {range("Corner radius", t.effects.radius, 4, 28, 1, (v) =>
                      config({ ...t, effects: { ...t.effects, radius: v } }),
                    )}
                    {(["shadows", "motion"] as const).map((k) => (
                      <label key={k}>
                        <input
                          type="checkbox"
                          checked={t.effects[k]}
                          onChange={(e) =>
                            config({
                              ...t,
                              effects: { ...t.effects, [k]: e.target.checked },
                            })
                          }
                        />
                        {k === "motion" ? "Interface motion" : "Soft shadows"}
                      </label>
                    ))}
                  </>
                )}
              </div>
            </aside>
            <ThemePreview config={t} />
            <aside className="theme-details" inert={busy}>
              <label>
                Theme name
                <input
                  maxLength={60}
                  value={draft.name}
                  onChange={(e) => change({ ...draft, name: e.target.value })}
                />
              </label>
              <label>
                Description
                <textarea
                  maxLength={180}
                  value={draft.description}
                  onChange={(e) =>
                    change({ ...draft, description: e.target.value })
                  }
                />
              </label>
              <div className="theme-palette-summary">
                {Object.entries(t.colors).map(([k, v]) => (
                  <span
                    key={k}
                    title={THEME_COLOR_LABELS[k as keyof ThemeConfig["colors"]]}
                    style={{ background: v }}
                  />
                ))}
              </div>
              <div className="theme-history">
                <button
                  type="button"
                  disabled={!undo.length || busy}
                  onClick={() => {
                    setRedo((x) => [draft, ...x]);
                    setDraft(undo[undo.length - 1]);
                    setUndo((x) => x.slice(0, -1));
                  }}
                >
                  Undo
                </button>
                <button
                  type="button"
                  disabled={!redo.length || busy}
                  onClick={() => {
                    setUndo((x) => [...x, draft]);
                    setDraft(redo[0]);
                    setRedo((x) => x.slice(1));
                  }}
                >
                  Redo
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => change(clone(initial))}
                >
                  Reset
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    change({
                      ...clone(draft),
                      name: draft.name.slice(0, 54) + " copy",
                    });
                    setEditing(null);
                  }}
                >
                  Duplicate
                </button>
              </div>
              <div aria-live="polite" className="theme-validation">
                {issues.length ? (
                  <>
                    <strong>Improve readability before saving</strong>
                    {issues.map((x) => (
                      <p key={x}>{x}</p>
                    ))}
                  </>
                ) : (
                  <p>✓ Readable text contrast</p>
                )}
              </div>
              <small>
                Changes stay in this preview until you apply them. Saved themes
                sync with your account.
              </small>
            </aside>
          </div>
          <footer className="theme-studio-actions">
            {" "}
            <button
              className="primary"
              type="button"
              disabled={!canSave}
              onClick={() => void perform(() => save())}
            >
              Save theme
            </button>
            <button
              className="primary"
              type="button"
              disabled={!canSave}
              onClick={() => void perform(() => save(true))}
            >
              Save & apply theme
            </button>
            <p role="status">{busy ? "Working…" : message}</p>
          </footer>
        </dialog>
      )}
    </section>
  );
}
