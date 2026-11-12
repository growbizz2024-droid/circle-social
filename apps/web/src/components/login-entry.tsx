"use client";
import { useState } from "react";
import {
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialRequestOptionsJSON,
  type PublicKeyCredentialCreationOptionsJSON,
} from "@simplewebauthn/browser";
import { recoveryCodeSchema } from "@circle/validation";
import { api } from "./identity-panel";
import { BrandMark, Wordmark } from "./brand";
export default function LoginEntry({
  onDone,
  onCreate,
  notice,
}: {
  onDone: (recovered: boolean) => Promise<void>;
  onCreate: () => void;
  notice?: string;
}) {
  const [recover, setRecover] = useState(false),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function signIn() {
    setBusy(true);
    setError("");
    try {
      if (recover) {
        const parsed = recoveryCodeSchema.safeParse({ code: code.trim() });
        if (!parsed.success)
          throw new Error("Enter your complete saved recovery credential.");
        const options = await api<PublicKeyCredentialCreationOptionsJSON>(
          "auth/recovery/options",
          "POST",
          parsed.data,
        );
        await api(
          "auth/recovery/verify",
          "POST",
          await startRegistration({ optionsJSON: options }),
        );
        setCode("");
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
      await onDone(recover);
    } catch (e) {
      setError(
        recover && (e as { status?: number }).status === 401
          ? "This recovery credential could not be verified. Check the complete code; used, replaced or expired credentials cannot be reused."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="first-run">
      <section className="flow-card flow-login">
        <div className="flow-content">
          <BrandMark className="welcome-mark" />
          <Wordmark />
          <p className="flow-kicker">
            YOUR PEOPLE. YOUR COMMUNITIES. YOUR CONVERSATIONS.
          </p>
          <h1>{recover ? "Recover your account." : "Welcome back."}</h1>
          <p className="flow-description">
            {recover
              ? "Use your saved recovery credential and register a new passkey. Your code is used only after that passkey succeeds. Your existing passkeys stay registered; old sessions are revoked."
              : "Sign in securely with a registered passkey. No username or password needed."}
          </p>
          <p className="flow-fine-print">
            We save an approximate city/country with your session for account
            security. This is based on network IP, not device location.
          </p>
          {notice && (
            <p className="flow-fine-print" role="status">
              {notice}
            </p>
          )}
          {recover && (
            <label>
              Recovery credential
              <textarea
                autoComplete="off"
                spellCheck={false}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
          )}
          {error && (
            <p className="flow-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="flow-bottom">
          <button
            className="flow-primary"
            disabled={busy}
            onClick={() => void signIn()}
          >
            {busy
              ? "One moment…"
              : recover
                ? "Verify and create a new passkey"
                : "Continue with Passkey"}
          </button>
          {!recover && (
            <button
              className="flow-signin"
              disabled={busy}
              onClick={() => void signIn()}
            >
              Use another registered passkey
            </button>
          )}
          <button
            className="flow-signin"
            disabled={busy}
            onClick={() => {
              setRecover(!recover);
              setCode("");
              setError("");
            }}
          >
            {recover
              ? "Back to passkey login"
              : "Can’t access your account? Recover account"}
          </button>
          <button className="flow-signin" disabled={busy} onClick={onCreate}>
            New to Circle.social? Create an account
          </button>
        </footer>
      </section>
    </main>
  );
}
