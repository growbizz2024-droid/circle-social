"use client";
import ThemeSettings from "./theme-studio";
import Link from "next/link";
import Avatar from "./avatar";
import AvatarSettings from "./avatar-editor";
import { BrandMark, Wordmark, BrandScribble } from "./brand";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  startRegistration,
  startAuthentication,
} from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import {
  PROFILE_ACCENTS,
  PROFILE_THEMES,
  ONBOARDING_BACKGROUNDS,
} from "@circle/constants";
import type {
  UserProfile,
  SessionSummary,
  PasskeySummary,
  ProfileUpdate,
} from "@circle/shared-types";
import { profileUpdateSchema } from "@circle/validation";
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api/v1/" + path, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  if (response.status === 401)
    window.dispatchEvent(
      new CustomEvent("circle:theme", {
        detail: { activeTheme: null, authenticated: false },
      }),
    );
  if (!response.ok) {
    const themeError = path.startsWith("themes")
      ? (
          {
            400: "Choose supported theme values with readable contrast.",
            404: "This theme is no longer available. Refresh your themes.",
            409: "Theme changed on another device. Close and reopen the studio, or duplicate your draft.",
            413: "Theme storage is full. Delete an unused theme before saving.",
          } as Record<number, string>
        )[response.status]
      : undefined;
    const error = new Error(
      themeError ??
        (
          {
            400: "Please check the profile fields.",
            401: "Sign in to continue.",
            403: "Sign in again with your passkey to make this change.",
            409: "Your profile changed in another window. Reload it before saving.",
            429: "Too many attempts. Please wait a minute.",
            503: "Circle.social is temporarily unavailable. Please try again.",
          } as Record<number, string>
        )[response.status] ??
        "This change could not be completed.",
    ) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  const data = (await response.json()).data;
  if (data && typeof data === "object" && "activeTheme" in data)
    window.dispatchEvent(
      new CustomEvent("circle:theme", {
        detail: { activeTheme: data.activeTheme, authenticated: true },
      }),
    );
  if (
    path === "auth/logout" ||
    path === "auth/logout-all" ||
    path === "users/me/deactivate"
  )
    window.dispatchEvent(
      new CustomEvent("circle:theme", {
        detail: { activeTheme: null, authenticated: false },
      }),
    );
  return data as T;
}
export default function IdentityPanel({
  onAuthenticated,
  onSignedOut,
  onEditOnboarding,
  onHome,
  onRecovery,
}: {
  onAuthenticated?: () => void;
  onSignedOut?: (message?: string) => void;
  onEditOnboarding?: () => void;
  onHome?: () => void;
  onRecovery?: () => void;
} = {}) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [draft, setDraft] = useState<ProfileUpdate | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [keys, setKeys] = useState<PasskeySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const reload = useCallback(async () => {
    const value = await api<UserProfile>("users/me");
    setProfile(value);
    setDraft({
      profileVersion: value.profileVersion,
      displayName: value.displayName,
      bio: value.bio,
      avatarId: value.avatarId,
      profileTheme: value.profileTheme,
      profileAccent: value.profileAccent,
    });
    const [s, k] = await Promise.all([
      api<SessionSummary[]>("auth/sessions"),
      api<PasskeySummary[]>("auth/passkeys"),
    ]);
    setSessions(s);
    setKeys(k);
  }, []);
  useEffect(() => {
    let active = true;
    async function load() {
      const value = await api<UserProfile>("users/me");
      const [s, k] = await Promise.all([
        api<SessionSummary[]>("auth/sessions"),
        api<PasskeySummary[]>("auth/passkeys"),
      ]);
      if (!active) return;
      setProfile(value);
      setDraft({
        profileVersion: value.profileVersion,
        displayName: value.displayName,
        bio: value.bio,
        avatarId: value.avatarId,
        profileTheme: value.profileTheme,
        profileAccent: value.profileAccent,
      });
      setSessions(s);
      setKeys(k);
    }
    void load()
      .catch((e) => {
        if (active) {
          if ((e as { status?: number }).status === 401) onSignedOut?.();
          else setError((e as Error).message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [onSignedOut]);
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to complete this request.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function authenticate(register: boolean) {
    await perform(async () => {
      if (register) {
        const options = await api<PublicKeyCredentialCreationOptionsJSON>(
          "auth/registration/options",
          "POST",
          {},
        );
        const credential = await startRegistration({ optionsJSON: options });
        await api("auth/registration/verify", "POST", credential);
      } else {
        const options = await api<PublicKeyCredentialRequestOptionsJSON>(
          "auth/authentication/options",
          "POST",
          {},
        );
        const credential = await startAuthentication({ optionsJSON: options });
        await api("auth/authentication/verify", "POST", credential);
      }
      await reload();
      onAuthenticated?.();
      setMessage(
        register ? "Your identity is ready. Make it yours." : "Welcome back.",
      );
    });
  }
  const wallpaper = ONBOARDING_BACKGROUNDS.find(
    (x) => x.id === profile?.onboarding?.backgroundId,
  );
  return (
    <div
      className={`identity-shell${profile ? " account-space" : ""}${wallpaper ? " has-wallpaper" : ""}`}
      data-theme={(profile
        ? (draft?.profileTheme ?? "SYSTEM")
        : "DARK"
      ).toLowerCase()}
      style={
        {
          "--accent": "#FF6A00",
          "--wallpaper-url": wallpaper ? `url("${wallpaper.path}")` : "none",
        } as CSSProperties
      }
    >
      <header className="circle-header">
        <Link href="/" className="wordmark">
          <BrandMark className="brand-mark" />
          <Wordmark />
        </Link>
        <div>
          {onHome && (
            <button className="secondary" onClick={onHome}>
              Home feed
            </button>
          )}
        </div>
      </header>
      <main className="identity-main">
        <div className="intro">
          <p className="eyebrow">
            {profile ? "YOUR SPACE. YOUR PERSPECTIVE." : "A LITTLE MORE YOU"}
          </p>
          <h1>
            {profile ? (
              <>
                Your corner of <span className="brand-orange">Circle.</span>
              </>
            ) : (
              <>
                Real People.
                <br />
                <span className="brand-orange">Open Conversations.</span>
              </>
            )}
          </h1>
          <p>
            {profile
              ? "Make yourself at home. Your identity, your style, your say."
              : "A space where you can be yourself, share freely, and find communities that truly get you."}
          </p>
          <BrandScribble />
        </div>
        {loading ? (
          <section className="panel" aria-live="polite">
            Opening your space…
          </section>
        ) : !profile ? (
          <section className="panel welcome">
            <BrandMark className="welcome-mark" />
            <p className="eyebrow">HELLO, NEW FRIEND</p>
            <h2>
              Your people.
              <br />
              Your kind of space.
            </h2>
            <p>
              Your passkey unlocks a unique pseudonym. No password to remember,
              no real name required.
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void authenticate(true)}
            >
              Create my identity <span>↗</span>
            </button>
            <button
              className="quiet"
              disabled={busy}
              onClick={() => void authenticate(false)}
            >
              Already here? Sign in with a passkey
            </button>
          </section>
        ) : (
          <div className="settings-grid">
            <aside className="panel profile-preview">
              <div
                className="profile-cover"
                aria-hidden="true"
                style={{
                  backgroundImage: `linear-gradient(0deg, #0b0b0b33, transparent), url("${wallpaper?.path ?? "/onboarding/ember.jpg"}")`,
                }}
              />
              <p className="eyebrow profile-label">YOUR CIRCLE IDENTITY</p>
              <div className="avatar hero-avatar">
                <Avatar
                  avatar={profile?.avatar}
                  seed={profile?.handle}
                  size={112}
                />
              </div>
              <h2>{draft?.displayName || profile.handle}</h2>
              <p className="handle">@{profile.handle}</p>
              <p className="preview-bio">
                {draft?.bio || "A new voice in the conversation."}
              </p>
              {onRecovery && (
                <button className="secondary" onClick={onRecovery}>
                  Recovery credential
                </button>
              )}
              <span className="privacy-note">◈ Pseudonymous by design</span>
              <button
                className="quiet"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await api("auth/logout", "POST", {});
                    setProfile(null);
                    onSignedOut?.();
                    setDraft(null);
                    setSessions([]);
                    setKeys([]);
                  })
                }
              >
                Sign out
              </button>
            </aside>
            <div className="settings-content">
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">01 / EXPRESSION</p>
                    <h2>Make it yours</h2>
                    {onEditOnboarding && (
                      <button
                        className="secondary style-edit"
                        onClick={onEditOnboarding}
                      >
                        Edit your style & interests
                      </button>
                    )}
                  </div>
                  <span className="pill">Profile</span>
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void perform(async () => {
                      const body = profileUpdateSchema.safeParse(draft);
                      if (!body.success)
                        throw new Error(
                          "Please check your name, bio, and appearance.",
                        );
                      const updated = await api<UserProfile>(
                        "users/me",
                        "PATCH",
                        body.data,
                      );
                      setProfile(updated);
                      setDraft({
                        profileVersion: updated.profileVersion,
                        displayName: updated.displayName,
                        bio: updated.bio,
                        avatarId: updated.avatarId,
                        profileTheme: updated.profileTheme,
                        profileAccent: updated.profileAccent,
                      });
                      setMessage("Profile saved.");
                    });
                  }}
                >
                  <fieldset disabled={busy}>
                    <legend>Your avatar</legend>
                    <AvatarSettings
                      onSaved={async () =>
                        setProfile(await api<UserProfile>("users/me"))
                      }
                    />
                    <label>
                      Display name <span>Optional · 50 characters</span>
                      <input
                        autoComplete="nickname"
                        maxLength={50}
                        value={draft?.displayName ?? ""}
                        onChange={(e) =>
                          setDraft((d) =>
                            d ? { ...d, displayName: e.target.value } : d,
                          )
                        }
                        placeholder="What should we call you?"
                      />
                    </label>
                    <label>
                      Bio <span>Optional · 280 characters</span>
                      <textarea
                        maxLength={280}
                        rows={3}
                        value={draft?.bio ?? ""}
                        onChange={(e) =>
                          setDraft((d) =>
                            d ? { ...d, bio: e.target.value } : d,
                          )
                        }
                        placeholder="A few words about your world…"
                      />
                    </label>
                    <ThemeSettings
                      onApplied={async () => {
                        setProfile(await api<UserProfile>("users/me"));
                      }}
                    />
                    <div className="appearance-row">
                      <label>
                        Appearance
                        <select
                          value={draft?.profileTheme}
                          onChange={(e) =>
                            setDraft((d) =>
                              d
                                ? {
                                    ...d,
                                    profileTheme: e.target
                                      .value as UserProfile["profileTheme"],
                                  }
                                : d,
                            )
                          }
                        >
                          {PROFILE_THEMES.map((theme) => (
                            <option key={theme} value={theme}>
                              {theme[0] + theme.slice(1).toLowerCase()}
                            </option>
                          ))}
                        </select>
                      </label>
                      <fieldset className="accent-picker">
                        <legend>Accent</legend>
                        {Object.entries(PROFILE_ACCENTS).map(
                          ([name, color]) => (
                            <button
                              key={name}
                              type="button"
                              aria-label={`${name.toLowerCase()} accent`}
                              aria-pressed={draft?.profileAccent === name}
                              style={{ background: color }}
                              onClick={() =>
                                setDraft((d) =>
                                  d
                                    ? {
                                        ...d,
                                        profileAccent:
                                          name as UserProfile["profileAccent"],
                                      }
                                    : d,
                                )
                              }
                            />
                          ),
                        )}
                      </fieldset>
                    </div>
                    <div className="save-row">
                      <button className="primary" type="submit">
                        {busy ? "Saving…" : "Save profile"}
                      </button>
                      <button
                        className="quiet"
                        type="button"
                        onClick={() => void perform(reload)}
                      >
                        Reload profile
                      </button>
                    </div>
                  </fieldset>
                </form>
              </section>
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">02 / ACCESS</p>
                    <h2>Your keys & sessions</h2>
                  </div>
                </div>
                <p className="muted">
                  Passkeys stay on your devices. Keep a second key so you can
                  get back in.
                </p>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void authenticate(true)}
                >
                  Add a passkey
                </button>
                <ul className="device-list">
                  {keys.map((key) => (
                    <li key={key.id}>
                      <span>
                        ◈{" "}
                        {key.deviceType === "multiDevice"
                          ? "Synced passkey"
                          : "Device passkey"}
                        <small>
                          Added {new Date(key.createdAt).toLocaleDateString()}
                        </small>
                      </span>
                      <button
                        className="quiet"
                        disabled={busy || keys.length <= 1}
                        onClick={() =>
                          void perform(async () => {
                            await api(
                              "auth/passkeys/" + encodeURIComponent(key.id),
                              "DELETE",
                            );
                            await reload();
                            setMessage("Passkey removed.");
                          })
                        }
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
                <h3>Active sessions</h3>
                <p className="muted">
                  Approximate login locations are private to your account. VPNs
                  and mobile networks may show another city.
                </p>
                <a
                  className="location-attribution"
                  href="https://db-ip.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  IP Geolocation by DB-IP
                </a>
                <ul className="device-list">
                  {sessions.map((session) => (
                    <li key={session.id}>
                      <span>
                        {session.current ? "This session" : "Another session"}
                        <small>
                          Started {new Date(session.createdAt).toLocaleString()}
                        </small>
                        <small className="session-location">
                          {session.location
                            ? [session.location.city, session.location.country]
                                .filter(Boolean)
                                .join(", ") + " · approximate"
                            : "Location unavailable"}
                        </small>
                      </span>
                      <button
                        className="quiet"
                        disabled={busy}
                        onClick={() =>
                          void perform(async () => {
                            await api("auth/sessions/" + session.id, "DELETE");
                            if (session.current) {
                              setProfile(null);
                              onSignedOut?.();
                              setDraft(null);
                            } else await reload();
                          })
                        }
                      >
                        Revoke
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  className="quiet"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      await api("auth/logout-all", "POST", {});
                      setProfile(null);
                      onSignedOut?.();
                      setDraft(null);
                    })
                  }
                >
                  Sign out of all sessions
                </button>
              </section>
              <section className="panel account-panel">
                <p className="eyebrow">03 / ACCOUNT</p>
                <h2>Take a break</h2>
                <p>
                  Deactivate your account and revoke every session. Your profile
                  and passkeys are retained. Reactivation is not available in
                  this milestone.
                </p>
                <label>
                  Type your handle to confirm
                  <input
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    autoComplete="off"
                    placeholder={profile.handle}
                  />
                </label>
                <button
                  className="danger"
                  disabled={busy || confirmation !== profile.handle}
                  onClick={() =>
                    void perform(async () => {
                      await api("users/me/deactivate", "POST", {
                        confirmation,
                      });
                      setProfile(null);
                      onSignedOut?.(
                        "Account deactivated. Your sessions have been revoked.",
                      );
                      setDraft(null);
                      setConfirmation("");
                      setMessage(
                        "Your account is deactivated. All sessions have been revoked.",
                      );
                    })
                  }
                >
                  Deactivate account
                </button>
              </section>
            </div>
          </div>
        )}
        <div className="feedback" aria-live="polite">
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="success">
              {message}
            </p>
          )}
        </div>
      </main>
      <footer className="circle-footer">
        A community for real conversations. <span>Circle.social</span>
      </footer>
    </div>
  );
}
