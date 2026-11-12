import { setAppTheme } from "../theme/store";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
const tokenKey = "circle.session";
const pendingKey = "circle.pending";
export const webUrl =
  process.env.EXPO_PUBLIC_WEB_URL ?? "http://localhost:3000";
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://127.0.0.1:3001";
const secureOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const encode = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
export async function signOutLocal() {
  setAppTheme(null);
  await SecureStore.deleteItemAsync(tokenKey);
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const token = await SecureStore.getItemAsync(tokenKey);
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/v1/${path}`, {
      method,
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        Origin: new URL(webUrl).origin,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error("Unable to reach Circle.social. Check your connection.");
  }
  if (!response.ok) {
    if (response.status === 401) await signOutLocal();
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
            400: "Please check your profile fields.",
            401: "Sign in to continue.",
            403: "Sign in again before making this change.",
            409: "Profile changed elsewhere. Reload before saving.",
            429: "Please wait a minute before trying again.",
          } as Record<number, string>
        )[response.status] ??
        "Circle.social is temporarily unavailable.",
    ) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  const data = (await response.json()).data;
  if (data && typeof data === "object" && "activeTheme" in data)
    setAppTheme(data.activeTheme?.config ?? null);
  return data as T;
}
let completion: { callback: string; promise: Promise<void> } | undefined;
export function completeSignIn(callback: string): Promise<void> {
  if (completion?.callback === callback) return completion.promise;
  const promise = exchangeSignIn(callback);
  completion = { callback, promise };
  return promise;
}
async function exchangeSignIn(callback: string): Promise<void> {
  const pending = await SecureStore.getItemAsync(pendingKey);
  if (!pending)
    throw new Error("This sign-in attempt expired. Please start again.");
  const { verifier, state } = JSON.parse(pending) as {
    verifier: string;
    state: string;
  };
  const url = new URL(callback);
  if (
    url.protocol !== "circlesocial:" ||
    url.hostname !== "auth" ||
    url.pathname !== "/callback" ||
    url.searchParams.get("state") !== state
  )
    throw new Error("Sign-in response did not match this device.");
  const code = url.searchParams.get("code");
  if (!code || !/^[-A-Za-z0-9_]{43}$/.test(code))
    throw new Error("Invalid sign-in response.");
  // Exchange carries no ambient cookies or previous session token.
  const response = await fetch(`${apiUrl}/v1/auth/mobile/exchange`, {
    method: "POST",
    credentials: "omit",
    headers: {
      "Content-Type": "application/json",
      Origin: new URL(webUrl).origin,
    },
    body: JSON.stringify({ code, verifier }),
  });
  if (!response.ok)
    throw new Error("This sign-in link expired. Please start again.");
  const result = (await response.json()).data as { token: string };
  if (!/^[A-Za-z0-9_-]{43}$/.test(result.token))
    throw new Error("Invalid session response.");
  await SecureStore.setItemAsync(tokenKey, result.token, secureOptions);
  await SecureStore.deleteItemAsync(pendingKey);
}
export async function signIn(
  options: {
    registrationHandle?: string;
    setup?: unknown;
    existingIdentity?: boolean;
  } = {},
): Promise<void> {
  if (!__DEV__)
    throw new Error(
      "Native release authentication requires an associated HTTPS domain. This browser handoff is for local development.",
    );
  completion = undefined;
  const verifier = encode(await Crypto.getRandomBytesAsync(32));
  const state = encode(await Crypto.getRandomBytesAsync(32));
  const challenge = (
    await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      verifier,
      { encoding: Crypto.CryptoEncoding.BASE64 },
    )
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  await SecureStore.setItemAsync(
    pendingKey,
    JSON.stringify({ verifier, state }),
    secureOptions,
  );
  const result = await WebBrowser.openAuthSessionAsync(
    `${webUrl}/mobile-connect?challenge=${challenge}&state=${state}${options.registrationHandle ? `&registerHandle=${encodeURIComponent(options.registrationHandle)}` : ""}${options.setup ? `&setup=${encodeURIComponent(JSON.stringify(options.setup))}` : ""}${options.existingIdentity ? "&resume=1" : ""}`,
    "circlesocial://auth/callback",
  );
  if (result.type !== "success") {
    await SecureStore.deleteItemAsync(pendingKey);
    throw new Error("Sign-in was cancelled.");
  }
  await completeSignIn(result.url);
}

export async function authenticatedMediaSource(path: string) {
  if (!/^\/v1\/media\/[0-9a-f-]{36}$/.test(path))
    throw new Error("Invalid media path");
  const token = await SecureStore.getItemAsync(tokenKey);
  return {
    uri: `${apiUrl}${path}`,
    headers: { Authorization: `Bearer ${token ?? ""}` },
  };
}
export async function uploadMedia(bytes: ArrayBuffer, mimeType: string) {
  if (bytes.byteLength > 12 * 1024 * 1024)
    throw new Error("Choose media smaller than 12 MB.");
  const token = await SecureStore.getItemAsync(tokenKey);
  const response = await fetch(`${apiUrl}/v1/media`, {
    method: "POST",
    credentials: "omit",
    headers: {
      Origin: new URL(webUrl).origin,
      "Content-Type": mimeType,
      Authorization: `Bearer ${token ?? ""}`,
    },
    body: bytes,
  });
  if (!response.ok)
    throw new Error(
      response.status === 413
        ? "Media is too large or your storage limit was reached."
        : "Media could not be uploaded. Use a supported image or a recording under two minutes.",
    );
  return (await response.json())
    .data as import("@circle/shared-types").PostMedia;
}
