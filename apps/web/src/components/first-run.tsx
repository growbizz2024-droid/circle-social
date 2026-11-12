"use client";
import Image from "next/image";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import {
  COMMUNITY_COVERS,
  INTERESTS,
  ONBOARDING_BACKGROUNDS,
  ONBOARDING_GENDERS,
  ONBOARDING_STEPS,
  ONBOARDING_VIBES,
  onboardingHandles,
} from "@circle/constants";
import { handleSchema, onboardingDraftSchema } from "@circle/validation";
import type { OnboardingDraft, UserProfile } from "@circle/shared-types";
import IdentityPanel, { api } from "./identity-panel";
import { BrandMark, BrandScribble, Wordmark } from "./brand";
import HomeFeed from "./home-feed";
import Avatar from "./avatar";
import { AvatarEditor } from "./avatar-editor";
import { generateAvatar } from "@circle/avatar-engine";
import LoginEntry from "./login-entry";
import type {
  CommunitySummary,
  Page,
  RecoveryStatus,
} from "@circle/shared-types";
const storageKey = "circle.onboarding.v1";
function mobileReturn(): string | null {
  try {
    const value = sessionStorage.getItem("circle.mobile-return");
    if (!value) return null;
    const url = new URL(value, location.origin);
    if (
      url.origin !== location.origin ||
      url.pathname !== "/mobile-connect" ||
      !/^[-A-Za-z0-9_]{43}$/.test(url.searchParams.get("challenge") ?? "") ||
      !/^[-A-Za-z0-9_]{43}$/.test(url.searchParams.get("state") ?? "")
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

function storeDraft(draft?: OnboardingDraft) {
  try {
    if (draft) sessionStorage.setItem(storageKey, JSON.stringify(draft));
    else sessionStorage.removeItem(storageKey);
  } catch {}
}

function freshDraft(): OnboardingDraft {
  const suggestions = onboardingHandles(
    Array.from(crypto.getRandomValues(new Uint16Array(15))),
  );
  return {
    version: 1,
    intent: "create",
    step: "splash",
    gender: null,
    vibe: "BOLD",
    backgroundId: "ember",
    handle: suggestions[0],
    suggestions,
    interests: [],
    avatar: generateAvatar(crypto.randomUUID()),
    readyToFinish: false,
  };
}
function fromProfile(p: UserProfile): OnboardingDraft {
  return {
    ...freshDraft(),
    ...p.onboarding,
    intent: "edit",
    step: "gender",
    boundUserId: p.id,
    baseVersion: p.profileVersion,
    handle: p.handle,
    suggestions: [p.handle],
  };
}
function resumeRegistration(
  p: UserProfile,
  stored: OnboardingDraft | undefined,
  confirmed: boolean,
): OnboardingDraft {
  const own =
    stored &&
    stored.handle === p.handle &&
    (!stored.boundUserId || stored.boundUserId === p.id);
  const safeStep =
    own && ["interests", "communities", "review"].includes(stored.step)
      ? stored.step
      : "interests";
  return {
    ...freshDraft(),
    ...p.onboarding,
    ...(own ? stored : {}),
    intent: "create",
    handle: p.handle,
    suggestions: [p.handle],
    boundUserId: p.id,
    baseVersion: p.profileVersion,
    step: confirmed ? safeStep : "recovery",
    readyToFinish: false,
  };
}
function savedDraft(): OnboardingDraft | undefined {
  try {
    const value = onboardingDraftSchema.safeParse(
      JSON.parse(sessionStorage.getItem(storageKey) ?? "null"),
    );
    if (value.success) return value.data;
  } catch {}
}
function backdrop(id: string) {
  return (
    ONBOARDING_BACKGROUNDS.find((x) => x.id === id)?.path ??
    ONBOARDING_BACKGROUNDS[0].path
  );
}
function preferences(d: OnboardingDraft, version: number) {
  return {
    profileVersion: version,
    gender: d.gender,
    vibe: d.vibe,
    backgroundId: d.backgroundId,
    interests: d.interests,
  };
}
export default function FirstRun() {
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [screen, setScreen] = useState<
    "loading" | "wizard" | "profile" | "home" | "login"
  >("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [recovery, setRecovery] = useState<{
    code: string;
    expiresAt: string;
  } | null>(null);
  const [recoverySaved, setRecoverySaved] = useState(false);
  const [recoveryConfirmed, setRecoveryConfirmed] = useState(false);
  const [communities, setCommunities] = useState<CommunitySummary[]>([]);
  useEffect(() => {
    if (draft?.step === "communities" || draft?.step === "review")
      void api<Page<CommunitySummary>>("communities")
        .then((x) => setCommunities(x.items))
        .catch((e) => setError(e.message));
  }, [draft?.step]);
  useEffect(() => {
    let active = true;
    if (draft?.step === "recovery" && profile && !recovery)
      void api<RecoveryStatus>("auth/recovery/status")
        .then((x) => {
          if (active) setRecoveryConfirmed(x.confirmed);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [draft?.step, profile, recovery]);
  useEffect(() => {
    let active = true;
    async function initialize() {
      let stored: OnboardingDraft | undefined;
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (raw) {
          const parsed = onboardingDraftSchema.safeParse(JSON.parse(raw));
          if (parsed.success) stored = parsed.data;
        }
      } catch {}
      let current: UserProfile | null = null;
      try {
        current = await api<UserProfile>("users/me");
      } catch (e) {
        if ((e as { status?: number }).status !== 401 && active)
          setError((e as Error).message);
      }
      if (!active) return;
      setProfile(current);
      if (current && !current.onboardingCompletedAt) {
        const status = await api<RecoveryStatus>("auth/recovery/status");
        if (!active) return;
        const resumed = resumeRegistration(current, stored, status.confirmed);
        setDraft(resumed);
        storeDraft(resumed);
        setRecoveryConfirmed(status.confirmed);
        setScreen("wizard");
        return;
      }
      if (current) {
        const ownDraft =
          stored &&
          stored.handle === current.handle &&
          (!stored.boundUserId || stored.boundUserId === current.id);
        if (stored && ownDraft && stored.intent === "edit") {
          setDraft({ ...stored, boundUserId: current.id });
          setScreen("wizard");
        } else {
          storeDraft();
          setScreen("home");
        }
      } else if (stored?.intent === "create" && stored.boundUserId) {
        setDraft(stored);
        setScreen("login");
      } else {
        setDraft(
          stored?.intent === "create"
            ? {
                ...stored,
                step: stored.step === "interests" ? "passkey" : stored.step,
              }
            : freshDraft(),
        );
        setScreen("wizard");
      }
    }
    void initialize().catch((e) => {
      if (!active) return;
      if ((e as { status?: number }).status === 401) {
        setProfile(null);
        setScreen("login");
      } else {
        setError(
          e instanceof Error
            ? e.message
            : "Unable to load your account. Please try again.",
        );
        setDraft(freshDraft());
        setScreen("wizard");
      }
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (draft && screen === "wizard") {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(draft));
      } catch {}
    }
  }, [draft, screen]);
  useEffect(() => {
    if (screen !== "wizard" || draft?.step !== "splash") return;
    const timer = setTimeout(
      () => setDraft((d) => (d ? { ...d, step: "welcome" } : d)),
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1200,
    );
    return () => clearTimeout(timer);
  }, [draft?.step, screen]);
  const signedOut = useCallback((message?: string) => {
    storeDraft();
    try {
      sessionStorage.removeItem("circle.mobile-return");
    } catch {}
    setProfile(null);
    setRecovery(null);
    setRecoverySaved(false);
    setRecoveryConfirmed(false);
    setDraft(freshDraft());
    setScreen("wizard");
    setError("");
    setNotice(message ?? "");
  }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const ensureHomeAccess = useCallback(async () => {
    try {
      const p = await api<UserProfile>("users/me");
      setProfile(p);
      if (p.onboardingCompletedAt) return true;
      const status = await api<RecoveryStatus>("auth/recovery/status");
      const resumed = resumeRegistration(p, savedDraft(), status.confirmed);
      setDraft(resumed);
      storeDraft(resumed);
      setRecoveryConfirmed(status.confirmed);
      setRecovery(null);
      setRecoverySaved(false);
      setScreen("wizard");
      return false;
    } catch (e) {
      if ((e as { status?: number }).status === 401) {
        setProfile(null);
        setNotice("Your session expired. Sign in to continue.");
        setScreen("login");
      } else
        setError(
          e instanceof Error
            ? e.message
            : "Unable to check your account. Please try again.",
        );
      return false;
    }
  }, []);
  async function edit() {
    await run(async () => {
      const p = await api<UserProfile>("users/me");
      setProfile(p);
      setDraft(fromProfile(p));
      setScreen("wizard");
    });
  }
  async function finish() {
    if (!draft) return;
    await run(async () => {
      let p = profile;
      if (draft.intent === "create" && !p) {
        let options: PublicKeyCredentialCreationOptionsJSON;
        try {
          options = await api("auth/registration/options", "POST", {
            handle: draft.handle,
            avatar: draft.avatar,
            intent: "create",
          });
        } catch (e) {
          if ((e as { status?: number }).status === 409)
            throw new Error(
              "That username is unavailable, or another identity is signed in. Go back and choose another username, or sign in.",
            );
          throw e;
        }
        const credential = await startRegistration({ optionsJSON: options });
        try {
          await api("auth/registration/verify", "POST", credential);
        } catch (e) {
          // A response can be lost after the server creates the account; inspect the cookie session before retrying registration.
          const recovered = await api<UserProfile>("users/me").catch(
            () => null,
          );
          if (!recovered || recovered.handle !== draft.handle) throw e;
        }
        p = await api<UserProfile>("users/me");
        setProfile(p);
        const bound = {
          ...draft,
          boundUserId: p.id,
          readyToFinish: false,
          step: "recovery" as const,
          baseVersion: p.profileVersion,
        };
        setDraft(bound);
        storeDraft(bound);
        return;
      }
      if (draft.step === "passkey" && p) {
        const bound = {
          ...draft,
          step: "recovery" as const,
          boundUserId: p.id,
          baseVersion: p.profileVersion,
          readyToFinish: false,
        };
        setDraft(bound);
        storeDraft(bound);
        return;
      }
      if (
        !p ||
        p.handle !== draft.handle ||
        (draft.boundUserId && draft.boundUserId !== p.id)
      )
        throw new Error(
          "The signed-in identity changed. Return to your profile before continuing.",
        );
      if (draft.intent === "create" && p.onboardingCompletedAt) {
        storeDraft();
        setScreen("profile");
        return;
      }
      const updated = await api<UserProfile>(
        draft.intent === "edit" ? "users/me/onboarding" : "users/me/complete",
        draft.intent === "edit" ? "PUT" : "POST",
        {
          ...preferences(draft, draft.baseVersion ?? p.profileVersion),
          ...(draft.intent === "create"
            ? { communityIds: draft.communityIds ?? [] }
            : {}),
        },
      );
      setProfile(updated);
      if (draft.intent === "edit") {
        storeDraft();
        setScreen("profile");
      } else {
        const completed = { ...draft, step: "complete" as const };
        setDraft(completed);
        storeDraft(completed);
      }
    });
  }
  async function enterHome() {
    if (!(await ensureHomeAccess())) return;
    storeDraft();
    const handoff = mobileReturn();
    if (handoff) {
      try {
        sessionStorage.removeItem("circle.mobile-return");
      } catch {}
      location.assign(handoff);
      return;
    }
    setScreen("home");
  }
  if (screen === "login")
    return (
      <LoginEntry
        notice={notice}
        onCreate={() => {
          setDraft(freshDraft());
          setScreen("wizard");
        }}
        onDone={async (recovered) => {
          setNotice("");
          const p = await api<UserProfile>("users/me");
          setProfile(p);
          if (recovered || !p.onboardingCompletedAt) {
            const resumed = {
              ...(draft?.handle === p.handle &&
              (!draft.boundUserId || draft.boundUserId === p.id)
                ? draft
                : freshDraft()),
              ...p.onboarding,
              intent: "create" as const,
              handle: p.handle,
              suggestions: [p.handle],
              boundUserId: p.id,
              baseVersion: p.profileVersion,
              step: "recovery" as const,
            };
            setDraft(resumed);
            storeDraft(resumed);
            setScreen("wizard");
          } else {
            storeDraft();
            setScreen("home");
          }
        }}
      />
    );
  if (screen === "home" && !profile?.onboardingCompletedAt)
    return (
      <main className="first-run">
        <p role="status">Checking your account setup…</p>
      </main>
    );
  if (screen === "home" && profile?.onboardingCompletedAt)
    return (
      <HomeFeed
        profile={profile}
        onAccessDenied={() => void ensureHomeAccess()}
        onReturnToApp={mobileReturn() ? () => void enterHome() : undefined}
        onProfile={() => setScreen("profile")}
        onSignOut={() => signedOut()}
      />
    );
  if (screen === "profile")
    return (
      <IdentityPanel
        onHome={() =>
          void run(async () => {
            if (await ensureHomeAccess()) setScreen("home");
          })
        }
        onRecovery={() => {
          const d = {
            ...freshDraft(),
            ...profile?.onboarding,
            handle: profile!.handle,
            suggestions: [profile!.handle],
            boundUserId: profile!.id,
            baseVersion: profile!.profileVersion,
            step: "recovery" as const,
          };
          setDraft(d);
          storeDraft(d);
          setRecoveryConfirmed(false);
          setScreen("wizard");
        }}
        onSignedOut={signedOut}
        onEditOnboarding={() => void edit()}
      />
    );
  if (!draft)
    return (
      <main className="first-run">
        <div className="flow-card flow-loading">
          <BrandMark className="splash-mark" />
          <p role="status">Opening your Circle…</p>
        </div>
      </main>
    );
  const editing = draft.intent === "edit";
  const steps = editing
    ? ONBOARDING_STEPS.filter((s) =>
        ["gender", "vibe", "background", "preview", "interests"].includes(s),
      )
    : ONBOARDING_STEPS;
  const index = steps.indexOf(draft.step);
  const change = (value: Partial<OnboardingDraft>) => {
    setError("");
    setNotice("");
    setDraft((d) => (d ? { ...d, ...value } : d));
  };
  const next = () => {
    if (
      draft.step === "username" &&
      !handleSchema.safeParse(draft.handle).success
    ) {
      setError("Use 3–40 lowercase letters, numbers or underscores.");
      return;
    }
    change({ step: steps[Math.min(index + 1, steps.length - 1)] });
  };
  const back = () => {
    if (
      draft.intent === "create" &&
      profile &&
      ["recovery", "complete"].includes(draft.step)
    )
      return;
    if (index > 0) change({ step: steps[index - 1] });
  };
  const selectedBackground = backdrop(draft.backgroundId);
  const isSplash = draft.step === "splash";
  const isWelcome = draft.step === "welcome";
  const headers: Record<string, [string, string, string]> = {
    gender: [
      "Let’s get to know you",
      "What’s your gender?",
      "Optional. This preference is private to your account.",
    ],
    vibe: [
      "Choose your vibe",
      "Pick a style that feels you.",
      "You can change this later in your profile.",
    ],
    background: [
      "Make it yours",
      "Choose a background.",
      "Give your space a look that feels right.",
    ],
    preview: [
      "Here’s a preview",
      "Looking good!",
      "A preview of your chosen appearance.",
    ],
    avatar: [
      "Your circle identity",
      "Make your avatar yours.",
      "Customize it, generate another, or keep your first look.",
    ],
    username: [
      "Create your identity",
      "Choose your username.",
      "This will be your permanent identity on Circle.social.",
    ],
    interests: [
      "What are you interested in?",
      "Choose your interests.",
      "Pick what speaks to you, or continue without selecting any.",
    ],
    passkey: [
      "Keep your account safe",
      "Set up your passkey.",
      "Create your identity with a secure, password-free sign-in. Next, secure your recovery credential.",
    ],
  };
  Object.assign(headers, {
    recovery: [
      "Keep a way back in",
      "Save your recovery credential.",
      "Shown once. Store it somewhere private, away from this device.",
    ],
    communities: [
      "Find your people",
      "Find your communities.",
      "Choose at least two, or skip and explore first.",
    ],
    review: [
      "One last look",
      "This is your Circle.",
      "Review your identity and choices before completing registration.",
    ],
    complete: [
      "You belong here",
      "You’re one of us now.",
      "Your identity, preferences and community memberships are ready.",
    ],
  });
  const h = headers[draft.step];
  return (
    <main className="first-run" data-vibe={draft.vibe.toLowerCase()}>
      {notice && (
        <p className="flow-notice" role="status">
          {notice}
        </p>
      )}
      <section
        className={`flow-card flow-${draft.step}`}
        aria-label="Circle.social setup"
        style={
          {
            "--chosen-background": `url("${selectedBackground}")`,
          } as CSSProperties
        }
      >
        {isSplash ? (
          <>
            <div className="flow-splash-art" />
            <div className="splash-lockup">
              <BrandMark className="splash-mark" />
              <Wordmark />
              <p>REAL PEOPLE. OPEN CONVERSATIONS.</p>
              <BrandScribble />
            </div>
            <button
              className="flow-skip"
              onClick={() => change({ step: "welcome" })}
            >
              Skip intro
            </button>
          </>
        ) : (
          <>
            <header className="flow-top">
              {isWelcome ? (
                <span className="flow-wordmark">
                  <Wordmark />
                </span>
              ) : (
                <>
                  <button
                    className="flow-back"
                    onClick={back}
                    disabled={
                      busy ||
                      index === 0 ||
                      (!!profile &&
                        !editing &&
                        ["recovery", "complete"].includes(draft.step))
                    }
                    aria-label="Back"
                  >
                    ←
                  </button>
                  <span className="flow-step-count">
                    {editing ? "YOUR PREFERENCES" : "MAKE YOURSELF AT HOME"}
                  </span>
                  {editing && (
                    <button
                      className="flow-close"
                      onClick={() => {
                        storeDraft();
                        setScreen("profile");
                      }}
                      disabled={busy}
                    >
                      Cancel
                    </button>
                  )}
                </>
              )}
            </header>
            {!isWelcome && (
              <div
                className="flow-progress"
                role="progressbar"
                aria-label="Setup progress"
                aria-valuemin={0}
                aria-valuemax={steps.length - 1}
                aria-valuenow={index}
              >
                <span
                  style={{
                    width: `${Math.max(8, (index / (steps.length - 1)) * 100)}%`,
                  }}
                />
              </div>
            )}
            <div className="flow-body">
              {isWelcome ? (
                <>
                  <div className="welcome-collage" aria-hidden="true">
                    <div
                      style={{ backgroundImage: `url(${backdrop("city")})` }}
                    />
                    <div
                      style={{
                        backgroundImage: `url(${backdrop("botanical")})`,
                      }}
                    />
                    <div
                      style={{
                        backgroundImage: `url(${backdrop("midnight")})`,
                      }}
                    />
                    <svg viewBox="0 0 80 70">
                      <path d="m8 45 3-30 19 14L42 7l7 23 22-8-8 31Z" />
                    </svg>
                  </div>
                  <div className="flow-welcome-copy">
                    <h1>
                      Real People.
                      <br />
                      <span>
                        Open
                        <br />
                        Conversations.
                      </span>
                    </h1>
                    <p>
                      A space where you can be yourself, share freely, and find
                      communities that truly get you.
                    </p>
                    <BrandScribble />
                  </div>
                </>
              ) : (
                <>
                  <p className="flow-kicker">{h[0]}</p>
                  <h1>{h[1]}</h1>
                  <p className="flow-description">{h[2]}</p>
                </>
              )}
              {draft.step === "gender" && (
                <div
                  className="flow-options"
                  role="radiogroup"
                  aria-label="Gender (optional)"
                >
                  {ONBOARDING_GENDERS.map((g) => (
                    <button
                      key={g.id}
                      className="flow-radio"
                      role="radio"
                      aria-checked={draft.gender === g.id}
                      disabled={busy}
                      onClick={() => change({ gender: g.id })}
                    >
                      <span className="option-symbol">{g.symbol}</span>
                      <span>{g.label}</span>
                      <span className="radio-dot" />
                    </button>
                  ))}
                  <button
                    className="flow-text-button"
                    onClick={() => {
                      change({ gender: null });
                      next();
                    }}
                  >
                    Skip for now
                  </button>
                </div>
              )}
              {draft.step === "vibe" && (
                <div className="vibe-grid" role="radiogroup" aria-label="Style">
                  {ONBOARDING_VIBES.map((v) => (
                    <button
                      key={v.id}
                      role="radio"
                      aria-checked={draft.vibe === v.id}
                      className="vibe-option"
                      style={{
                        backgroundImage: `url(${backdrop(v.backgroundId)})`,
                      }}
                      onClick={() =>
                        change({ vibe: v.id, backgroundId: v.backgroundId })
                      }
                    >
                      <span>
                        <strong>{v.label}</strong>
                        <small>{v.description}</small>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {draft.step === "background" && (
                <div
                  className="background-grid"
                  role="radiogroup"
                  aria-label="Background"
                >
                  {ONBOARDING_BACKGROUNDS.map((bg) => (
                    <button
                      key={bg.id}
                      role="radio"
                      aria-checked={draft.backgroundId === bg.id}
                      aria-label={bg.label}
                      style={{ backgroundImage: `url(${bg.path})` }}
                      onClick={() => change({ backgroundId: bg.id })}
                    >
                      <span>{bg.label}</span>
                      {draft.backgroundId === bg.id && (
                        <b aria-hidden="true">✓</b>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {draft.step === "preview" && (
                <div
                  className="appearance-preview"
                  data-vibe={draft.vibe.toLowerCase()}
                  style={{
                    backgroundImage: `linear-gradient(#0007,#0007),url(${selectedBackground})`,
                  }}
                >
                  <div className="preview-tabs">
                    <span>Feed</span>
                    <span>Discover</span>
                    <span>Communities</span>
                  </div>
                  <article>
                    <div className="preview-person">
                      <span>🦦</span>
                      <div>
                        <strong>@{draft.handle}</strong>
                        <small>Sample post · appearance preview</small>
                      </div>
                    </div>
                    <p>
                      Some days are just better with good people and great
                      conversations.
                    </p>
                    <div
                      className="preview-photo"
                      style={{ backgroundImage: `url(${backdrop("city")})` }}
                    />
                    <p className="preview-caption">
                      Your space. Your perspective.
                    </p>
                  </article>
                </div>
              )}
              {draft.step === "username" && (
                <div className="username-choices">
                  <label htmlFor="onboarding-handle">
                    Username
                    <input
                      id="onboarding-handle"
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      maxLength={40}
                      value={draft.handle}
                      onChange={(e) =>
                        change({ handle: e.target.value.toLowerCase() })
                      }
                      aria-describedby="username-help"
                    />
                  </label>
                  <p id="username-help">
                    3–40 lowercase letters, numbers or underscores. Availability
                    is confirmed at sign-up.
                  </p>
                  <div role="radiogroup" aria-label="Suggested usernames">
                    {draft.suggestions.map((handle) => (
                      <button
                        key={handle}
                        className="flow-radio handle-choice"
                        role="radio"
                        aria-checked={draft.handle === handle}
                        onClick={() => change({ handle })}
                      >
                        <span>{handle}</span>
                        <span className="radio-dot" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {draft.step === "interests" && (
                <div className="interest-chips" aria-label="Interests">
                  {INTERESTS.map((interest) => (
                    <button
                      key={interest.id}
                      aria-pressed={draft.interests.includes(interest.id)}
                      onClick={() =>
                        change({
                          interests: draft.interests.includes(interest.id)
                            ? draft.interests.filter((x) => x !== interest.id)
                            : [...draft.interests, interest.id],
                        })
                      }
                    >
                      {interest.label}
                    </button>
                  ))}
                </div>
              )}
              {draft.step === "passkey" && (
                <div className="passkey-intro">
                  <div className="fingerprint" aria-hidden="true">
                    <svg viewBox="0 0 100 100">
                      <path d="M22 40c0-35 56-35 56 0v12m-49-2V39c0-26 42-26 42 0v20m-35-7V39c0-17 28-17 28 0v23m-21-8V40c0-8 14-8 14 0v23c0 12-3 20-8 27M22 50v8c0 15-2 19-5 24m12-24c0 16-1 25-5 33m12-31c0 17-2 24-4 32m11-31c0 15-1 21-3 31m31-25c0 9-2 17-5 24m12-29c0 12-2 21-5 29" />
                    </svg>
                  </div>
                  <ul>
                    <li>◇ Faster and easier sign-in</li>
                    <li>◇ No password to remember</li>
                    <li>◇ Add a backup passkey in your profile</li>
                  </ul>
                  <p className="flow-fine-print">
                    We save an approximate city/country with your session for
                    account security. Your IP is looked up locally; device
                    location is not requested.
                  </p>
                  <p className="flow-identity-label">
                    Your identity: <strong>@{draft.handle}</strong>
                  </p>
                </div>
              )}
              {draft.step === "recovery" && (
                <div className="recovery-setup">
                  <p className="flow-description">
                    This credential is single-use and expires after one year. A
                    new code replaces your previous code only after you confirm
                    it. Adding a backup passkey remains available in your
                    profile.
                  </p>
                  <button
                    className="flow-signin"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const options =
                          await api<PublicKeyCredentialRequestOptionsJSON>(
                            "auth/authentication/options",
                            "POST",
                            {},
                          );
                        await api(
                          "auth/authentication/verify",
                          "POST",
                          await startAuthentication({ optionsJSON: options }),
                        );
                        const current = await api<UserProfile>("users/me");
                        if (current.id !== profile?.id)
                          throw new Error(
                            "A different identity signed in. Reload to open that account.",
                          );
                        setProfile(current);
                        setNotice(
                          "Passkey verified. You can update your recovery credential.",
                        );
                      })
                    }
                  >
                    Verify passkey again
                  </button>
                  {!recovery && (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const value = await api<{
                            code: string;
                            expiresAt: string;
                          }>("auth/recovery/issue", "POST", {});
                          setRecovery(value);
                          setRecoverySaved(false);
                          setRecoveryConfirmed(false);
                        })
                      }
                    >
                      {recoveryConfirmed
                        ? "Replace recovery credential"
                        : "Generate recovery credential"}
                    </button>
                  )}
                  {recovery && (
                    <>
                      <label>
                        Recovery credential
                        <code className="recovery-secret">{recovery.code}</code>
                      </label>
                      <p className="flow-fine-print">
                        Expires{" "}
                        {new Date(recovery.expiresAt).toLocaleDateString()}. It
                        will not be shown again after leaving this screen.
                      </p>
                      <div className="save-row">
                        <button
                          className="secondary"
                          onClick={() =>
                            void navigator.clipboard
                              .writeText(recovery.code)
                              .then(() =>
                                setNotice("Recovery credential copied."),
                              )
                              .catch(() =>
                                setError(
                                  "Copy failed. Select the displayed credential and save it manually.",
                                ),
                              )
                          }
                        >
                          Copy credential
                        </button>
                        <button
                          className="secondary"
                          onClick={() => {
                            const blob = new Blob(
                              [
                                `Circle.social recovery credential for @${draft.handle}\n${recovery.code}\nExpires ${recovery.expiresAt}\nKeep private. Single-use.\n`,
                              ],
                              { type: "text/plain" },
                            );
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = "circle-social-recovery.txt";
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                        >
                          Download credential
                        </button>
                      </div>
                      <label className="saved-confirm">
                        <input
                          type="checkbox"
                          checked={recoverySaved}
                          onChange={(e) => setRecoverySaved(e.target.checked)}
                        />{" "}
                        I have saved my recovery credential securely
                      </label>
                      <button
                        className="secondary"
                        disabled={busy || !recoverySaved || recoveryConfirmed}
                        onClick={() =>
                          void run(async () => {
                            await api("auth/recovery/confirm", "POST", {
                              code: recovery.code,
                            });
                            setRecoveryConfirmed(true);
                            setNotice("Recovery credential confirmed.");
                          })
                        }
                      >
                        {recoveryConfirmed
                          ? "Credential confirmed"
                          : "Confirm saved credential"}
                      </button>
                    </>
                  )}
                  {!recovery && recoveryConfirmed && (
                    <p role="status">
                      Your recovery credential is already confirmed. Keep your
                      saved copy private.
                    </p>
                  )}
                </div>
              )}
              {draft.step === "avatar" && (
                <AvatarEditor
                  initial={draft.avatar ?? generateAvatar(draft.handle)}
                  cancelLabel="Use generated avatar"
                  onCancel={() =>
                    change({
                      avatar: draft.avatar ?? generateAvatar(draft.handle),
                      step: "passkey",
                    })
                  }
                  onSave={(value) => change({ avatar: value, step: "passkey" })}
                />
              )}
              {draft.step === "communities" && (
                <div className="community-choices">
                  {communities.length ? (
                    communities.map((c) => (
                      <button
                        key={c.id}
                        className="community-choice"
                        aria-pressed={
                          draft.communityIds?.includes(c.id) ?? false
                        }
                        onClick={() =>
                          change({
                            communityIds: draft.communityIds?.includes(c.id)
                              ? draft.communityIds.filter((id) => id !== c.id)
                              : [...(draft.communityIds ?? []), c.id],
                          })
                        }
                      >
                        {COMMUNITY_COVERS[c.slug] && (
                          <Image
                            className="community-choice-cover"
                            src={COMMUNITY_COVERS[c.slug]}
                            alt=""
                            width={112}
                            height={112}
                            sizes="(max-width: 600px) 42vw, 190px"
                          />
                        )}
                        <strong>{c.name}</strong>
                        <span>{c.description}</span>
                        <b>
                          {draft.communityIds?.includes(c.id)
                            ? "Selected ✓"
                            : "Join +"}
                        </b>
                      </button>
                    ))
                  ) : (
                    <p>Loading communities…</p>
                  )}
                  <p className="flow-fine-print">
                    Selected communities are joined when you complete
                    registration.
                  </p>
                  <button
                    className="flow-signin"
                    onClick={() => change({ communityIds: [], step: "review" })}
                  >
                    Skip and explore first
                  </button>
                </div>
              )}
              {draft.step === "review" && (
                <div
                  className="panel review-card"
                  style={{
                    backgroundImage: `linear-gradient(#0b0b0bdd,#0b0b0bf5),url(${selectedBackground})`,
                    backgroundSize: "cover",
                  }}
                >
                  <div className="avatar hero-avatar">
                    <Avatar
                      avatar={profile?.avatar ?? draft.avatar}
                      seed={draft.handle}
                      size={112}
                    />
                  </div>
                  <h2>@{draft.handle}</h2>
                  <dl>
                    <dt>Vibe</dt>
                    <dd>{draft.vibe.toLowerCase()}</dd>
                    <dt>Background</dt>
                    <dd>{draft.backgroundId}</dd>
                    <dt>Interests</dt>
                    <dd>
                      {draft.interests.length
                        ? draft.interests
                            .map(
                              (id) => INTERESTS.find((x) => x.id === id)?.label,
                            )
                            .join(", ")
                        : "Explore without selecting interests"}
                    </dd>
                    <dt>Communities to join</dt>
                    <dd>
                      {draft.communityIds?.length
                        ? communities
                            .filter((c) => draft.communityIds?.includes(c.id))
                            .map((c) => c.name)
                            .join(", ")
                        : "Explore first"}
                    </dd>
                  </dl>
                  <p className="flow-fine-print">
                    Your passkey is registered and your recovery credential is
                    confirmed. Your public identity stays the same across every
                    community.
                  </p>
                </div>
              )}
              {draft.step === "complete" && (
                <div className="registration-complete">
                  <BrandMark className="welcome-mark" />
                  <h2>@{draft.handle}</h2>
                  <p className="flow-description">
                    One identity. All your communities. Real conversations.
                  </p>
                </div>
              )}
            </div>
            <footer className="flow-bottom">
              {error && (
                <p className="flow-error" role="alert">
                  {error}
                </p>
              )}
              {draft.step === "username" && (
                <p className="flow-fine-print">
                  Your handle stays stable. You can edit your display name
                  later.
                </p>
              )}
              <button
                className="flow-primary"
                hidden={draft.step === "avatar"}
                disabled={busy}
                onClick={() => {
                  if (
                    draft.step === "passkey" ||
                    draft.step === "review" ||
                    (editing && draft.step === "interests")
                  )
                    void finish();
                  else if (draft.step === "recovery") {
                    if (!recoveryConfirmed) {
                      setError(
                        "Generate and confirm a saved recovery credential first.",
                      );
                      return;
                    }
                    setRecovery(null);
                    setRecoverySaved(false);
                    if (profile?.onboardingCompletedAt) {
                      storeDraft();
                      setScreen("home");
                    } else next();
                  } else if (draft.step === "complete") void enterHome();
                  else next();
                }}
              >
                {busy
                  ? "One moment…"
                  : draft.step === "passkey"
                    ? profile
                      ? "Continue"
                      : "Set up passkey"
                    : draft.step === "review"
                      ? "Complete registration"
                      : draft.step === "complete"
                        ? "Explore Circle.social"
                        : draft.step === "interests" && editing
                          ? "Save preferences"
                          : isWelcome
                            ? "Get Started"
                            : "Continue"}
              </button>
              {isWelcome && (
                <button
                  className="flow-signin"
                  disabled={busy}
                  onClick={() => setScreen("login")}
                >
                  Already here? Sign in
                </button>
              )}
              {error && profile && (
                <button className="flow-signin" onClick={() => void edit()}>
                  Reload saved choices
                </button>
              )}
            </footer>
          </>
        )}
      </section>
    </main>
  );
}
