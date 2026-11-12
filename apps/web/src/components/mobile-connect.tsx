"use client";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import type {
  UserSummary,
  UserProfile,
  OnboardingDraft,
} from "@circle/shared-types";
import {
  avatarSpecSchema,
  handleSchema,
  onboardingPreferencesSchema,
  onboardingDraftSchema,
} from "@circle/validation";
import { BrandMark, Wordmark } from "./brand";
import { api } from "./identity-panel";
export default function MobileConnect() {
  const params = useSearchParams();
  const router = useRouter();
  const challenge = params.get("challenge");
  const state = params.get("state");
  const requested = params.get("registerHandle");
  const resuming = params.get("resume") === "1";
  const [user, setUser] = useState<UserSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void api<UserSummary>("auth/me")
      .then((p) => {
        if (active) setUser(p);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  if (
    !challenge ||
    !state ||
    !/^[-A-Za-z0-9_]{43}$/.test(challenge) ||
    !/^[-A-Za-z0-9_]{43}$/.test(state) ||
    (requested !== null && !handleSchema.safeParse(requested).success)
  )
    return (
      <main className="identity-main connect-main">
        <h1>Open sign-in from the Circle.social app.</h1>
      </main>
    );
  const mismatch = user && requested && user.handle !== requested;
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(
        (e as { status?: number }).status === 409
          ? "That username is unavailable or another identity is signed in. Return to the app to choose another, or sign out here."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function continueSetup(): Promise<boolean> {
    const p = await api<UserProfile>("users/me");
    if (p.onboardingCompletedAt) return false;
    if (requested && p.handle !== requested)
      throw new Error(
        "The browser identity changed. Sign out before continuing.",
      );
    let preferences = {
      gender: null,
      vibe: "BOLD",
      backgroundId: "ember",
      interests: [],
      ...p.onboarding,
    };
    const raw = params.get("setup");
    if (raw) {
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        throw new Error("Invalid setup preferences. Reopen from the app.");
      }
      const parsed = onboardingPreferencesSchema.extend({avatar:avatarSpecSchema.optional()}).safeParse(value);
      if (!parsed.success)
        throw new Error("Invalid setup preferences. Reopen from the app.");
      preferences = { ...parsed.data };
    }
    const draft: OnboardingDraft = {
      ...preferences,
      version: 1,
      intent: "create",
      step: "recovery",
      handle: p.handle,
      suggestions: [p.handle],
      boundUserId: p.id,
      baseVersion: p.profileVersion,
      readyToFinish: false,
      communityIds: [],
    } as OnboardingDraft;
    const existing = sessionStorage.getItem("circle.onboarding.v1");
    // Preserve the same identity's later progress when reopening the browser sheet.
    let saved: OnboardingDraft | null = null;
    try {
      const parsed = existing
        ? onboardingDraftSchema.safeParse(JSON.parse(existing))
        : null;
      saved = parsed?.success ? parsed.data : null;
    } catch {}
    if (!saved || saved.boundUserId !== p.id)
      sessionStorage.setItem("circle.onboarding.v1", JSON.stringify(draft));
    sessionStorage.setItem(
      "circle.mobile-return",
      `/mobile-connect?challenge=${encodeURIComponent(challenge!)}&state=${encodeURIComponent(state!)}`,
    );
    router.push("/");
    return true;
  }
  async function authenticate(register = !!requested && !resuming) {
    await run(async () => {
      if (register && requested) {
        const options = await api<PublicKeyCredentialCreationOptionsJSON>(
          "auth/registration/options",
          "POST",
          { handle: requested, intent: "create",avatar:params.get("setup")?onboardingPreferencesSchema.extend({avatar:avatarSpecSchema.optional()}).parse(JSON.parse(params.get("setup")!)).avatar:undefined },
        );
        await api(
          "auth/registration/verify",
          "POST",
          await startRegistration({ optionsJSON: options }),
        );
      } else {
        const options = await api<PublicKeyCredentialRequestOptionsJSON>(
          "auth/authentication/options",
          "POST",
          {},
        );
        await api(
          "auth/authentication/verify",
          "POST",
          await startAuthentication({ optionsJSON: options }),
        );
      }
      setUser(await api<UserSummary>("auth/me"));
      await continueSetup();
    });
  }
  async function signOut() {
    await run(async () => {
      try {
        await api("auth/logout", "POST", {});
      } catch (e) {
        if ((e as { status?: number }).status !== 401) throw e;
      }
      setUser(null);
    });
  }
  return (
    <main className="identity-main connect-main">
      <section className="panel welcome">
        <div className="connect-brand">
          <BrandMark className="welcome-mark" />
          <Wordmark />
        </div>
        <p className="eyebrow">YOUR CIRCLE, ON YOUR DEVICE</p>
        <h1>
          {loading
            ? "Opening sign-in…"
            : mismatch
              ? "Choose your identity"
              : user
                ? "Continue to the app"
                : requested && !resuming
                  ? "Set up your passkey."
                  : "Welcome back."}
        </h1>
        {loading ? (
          <p>Checking this browser’s session…</p>
        ) : mismatch ? (
          <>
            <p>
              This browser is signed in as <strong>@{user.handle}</strong>. Your
              app is creating <strong>@{requested}</strong>.
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void signOut()}
            >
              Sign out to create @{requested}
            </button>
          </>
        ) : user ? (
          <>
            <p>
              Continue as <strong>@{user.handle}</strong>. This creates a
              separate app session. Continue only if you started sign-in in
              Circle.social.
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (await continueSetup()) return;
                  const { code } = await api<{ code: string }>(
                    "auth/mobile/authorize",
                    "POST",
                    { challenge },
                  );
                  window.location.assign(
                    `circlesocial://auth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
                  );
                })
              }
            >
              Continue to the app ↗
            </button>
            <button
              className="quiet"
              disabled={busy}
              onClick={() => void signOut()}
            >
              Sign in again or use another identity
            </button>
          </>
        ) : (
          <>
            <p>
              {requested ? (
                <>
                  {resuming ? "Sign in as" : "Create"}{" "}
                  <strong>@{requested}</strong> using a passkey. Your style
                  choices carry into recovery, interests and community setup
                  before you return.
                </>
              ) : (
                "Use your existing passkey, then return to Circle.social."
              )}
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void authenticate()}
            >
              {requested && !resuming
                ? "Set up passkey"
                : "Sign in with a passkey"}
            </button>
            {requested && !resuming && (
              <button
                className="quiet"
                disabled={busy}
                onClick={() => void authenticate(false)}
              >
                Already created this identity? Sign in
              </button>
            )}
          </>
        )}
        <p className="muted">
          Approximate city/country is saved privately with the app session for
          account security. Device location is not requested.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
