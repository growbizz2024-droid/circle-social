import {generateAvatar} from "@circle/avatar-engine";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import type { ImageSourcePropType } from "react-native";
import type {
  BackgroundId,
  OnboardingDraft,
  UserProfile,
} from "@circle/shared-types";
import { onboardingHandles } from "@circle/constants";
import { onboardingDraftSchema } from "@circle/validation";
const key = "circle.onboarding.draft.v1";
let writes: Promise<void> = Promise.resolve();
export const backgroundSources: Record<BackgroundId, ImageSourcePropType> = {
  ember: require("../../../../assets/onboarding/ember.jpg"),
  clouds: require("../../../../assets/onboarding/clouds.jpg"),
  botanical: require("../../../../assets/onboarding/botanical.jpg"),
  alpine: require("../../../../assets/onboarding/alpine.jpg"),
  city: require("../../../../assets/onboarding/city.jpg"),
  midnight: require("../../../../assets/onboarding/midnight.jpg"),
};
export async function newDraft(
  profile?: UserProfile,
): Promise<OnboardingDraft> {
  const bytes = await Crypto.getRandomBytesAsync(30);
  const suggestions = onboardingHandles(
    Array.from({ length: 15 }, (_, i) => bytes[i * 2] * 256 + bytes[i * 2 + 1]),
  );
  const draft: OnboardingDraft = {
    version: 1,
    intent: "create",
    step: "splash",
    gender: null,
    vibe: "BOLD",
    backgroundId: "ember",
    handle: suggestions[0],
    suggestions,
    interests: [],
    avatar:generateAvatar(Crypto.randomUUID()),
    readyToFinish: false,
  };
  return profile
    ? {
        ...draft,
        ...profile.onboarding,
        intent: "edit",
        step: "gender",
        handle: profile.handle,
        suggestions: [profile.handle],
        boundUserId: profile.id,
        baseVersion: profile.profileVersion,
      }
    : draft;
}
export function saveDraft(draft: OnboardingDraft): Promise<void> {
  const value = JSON.stringify(draft);
  writes = writes
    .catch(() => {})
    .then(() =>
      SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
    );
  return writes;
}
export function clearDraft(): Promise<void> {
  writes = writes.catch(() => {}).then(() => SecureStore.deleteItemAsync(key));
  return writes;
}
export async function readDraft(): Promise<OnboardingDraft | null> {
  await writes.catch(() => {});
  const raw = await SecureStore.getItemAsync(key);
  if (!raw) return null;
  try {
    const result = onboardingDraftSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
export function preferenceBody(d: OnboardingDraft, version: number) {
  return {
    profileVersion: version,
    gender: d.gender,
    vibe: d.vibe,
    backgroundId: d.backgroundId,
    interests: d.interests,
  };
}
// New registrations finish their sensitive stages in the authenticated browser.
// A partial or legacy app draft must never bypass recovery and completion checks.
export async function finishPendingOnboarding(
  profile: UserProfile,
): Promise<UserProfile> {
  const draft = await readDraft();
  if (!draft || draft.intent !== "create") return profile;
  if (
    profile.handle !== draft.handle ||
    (draft.boundUserId && draft.boundUserId !== profile.id)
  )
    throw new Error(
      "The browser signed in a different identity. Sign out before continuing.",
    );
  if (profile.onboardingCompletedAt) {
    await clearDraft();
    return profile;
  }
  await saveDraft({
    ...draft,
    boundUserId: profile.id,
    baseVersion: profile.profileVersion,
    step: "passkey",
    readyToFinish: false,
  });
  return profile;
}
