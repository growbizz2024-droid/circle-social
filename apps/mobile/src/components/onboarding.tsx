import { AvatarEditor } from "./avatar-editor";
import { generateAvatar } from "@circle/avatar-engine";
import { useEffect, useRef, useState } from "react";
import {
  type TextProps,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ActivityIndicator,
} from "react-native";
import {
  View,
  Text as NativeText,
  TextInput,
  Pressable,
  ScrollView,
  ImageBackground,
  Image,
} from "../theme/primitives";
import { SafeAreaView } from "../theme/primitives";
import { Stack } from "expo-router";
import {
  ONBOARDING_STEPS,
  ONBOARDING_GENDERS,
  ONBOARDING_VIBES,
  ONBOARDING_BACKGROUNDS,
  INTERESTS,
} from "@circle/constants";
import { handleSchema } from "@circle/validation";
import { brand } from "@circle/design-tokens";
import type { OnboardingDraft, UserProfile } from "@circle/shared-types";
import {
  backgroundSources,
  newDraft,
  readDraft,
  saveDraft,
  clearDraft,
  finishPendingOnboarding,
  preferenceBody,
} from "../lib/onboarding";
import { api, signIn } from "../lib/session";
import { BrandMark, Wordmark } from "./brand";
function Text({ style, ...props }: TextProps) {
  return <NativeText {...props} style={[styles.text, style]} />;
}
export default function Onboarding({
  profile,
  onDone,
  onCancel,
  resumeRegistration = false,
}: {
  profile?: UserProfile;
  onDone: () => Promise<void>;
  onCancel?: () => void;
  resumeRegistration?: boolean;
}) {
  const initial = useRef({ profile, resumeRegistration });
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      const stored = await readDraft();
      const p = initial.current.profile;
      const own = p
        ? (stored?.intent === "edit" && stored.boundUserId === p.id) ||
          (stored?.intent === "create" &&
            !p.onboardingCompletedAt &&
            stored.handle === p.handle &&
            (!stored.boundUserId || stored.boundUserId === p.id))
        : stored?.intent === "create";
      let value = own
        ? stored!
        : await newDraft(initial.current.resumeRegistration ? undefined : p);
      if (initial.current.resumeRegistration && p)
        value = {
          ...value,
          ...p.onboarding,
          intent: "create",
          step: "passkey",
          handle: p.handle,
          suggestions: [p.handle],
          boundUserId: p.id,
          baseVersion: p.profileVersion,
          readyToFinish: false,
        };
      if (!p && value.intent === "create" && value.boundUserId)
        value = { ...value, step: "passkey", readyToFinish: false };
      if (
        ![
          "splash",
          "welcome",
          "gender",
          "vibe",
          "background",
          "preview",
          "username",
          "avatar",
          "passkey",
          "interests",
        ].includes(value.step)
      )
        value = { ...value, step: "passkey", readyToFinish: false };
      if (active) setDraft(value);
    })().catch(() => {
      if (active)
        setError("Your draft could not be loaded. Please reopen setup.");
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (draft)
      void saveDraft(draft).catch(() =>
        setError(
          "Your choices could not be saved on this device. Please keep setup open.",
        ),
      );
  }, [draft]);
  useEffect(() => {
    if (draft?.step !== "splash") return;
    const timer = setTimeout(
      () => setDraft((d) => (d ? { ...d, step: "welcome" } : d)),
      1200,
    );
    return () => clearTimeout(timer);
  }, [draft?.step]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!draft)
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={brand.orange} />
        {!!error && <Text>{error}</Text>}
      </SafeAreaView>
    );
  const editing = draft.intent === "edit";
  const steps = editing
    ? ONBOARDING_STEPS.filter((s) =>
        ["gender", "vibe", "background", "preview", "interests"].includes(s),
      )
    : ONBOARDING_STEPS.filter(
        (s) => !["recovery", "communities", "review", "complete"].includes(s),
      );
  const index = steps.indexOf(draft.step);
  function change(value: Partial<OnboardingDraft>) {
    if (busy) return;
    setError("");
    setDraft((d) => (d ? { ...d, ...value } : d));
  }
  function next() {
    if (!draft) return;
    if (
      draft.step === "username" &&
      !handleSchema.safeParse(draft.handle).success
    ) {
      setError("Use 3–40 lowercase letters, numbers or underscores.");
      return;
    }
    Keyboard.dismiss();
    change({ step: steps[Math.min(index + 1, steps.length - 1)] });
  }
  async function finish() {
    if (!draft) return;
    await run(async () => {
      if (editing) {
        if (!profile || profile.id !== draft.boundUserId)
          throw new Error("Please reopen your profile before editing.");
        await api(
          "users/me/onboarding",
          "PUT",
          preferenceBody(draft, draft.baseVersion ?? profile.profileVersion),
        );
        await clearDraft();
        await onDone();
        return;
      }
      const ready = { ...draft, readyToFinish: draft.step === "interests" };
      await saveDraft(ready);
      setDraft(ready);
      let current: UserProfile | null = null;
      try {
        current = await api<UserProfile>("users/me");
      } catch (e) {
        if ((e as { status?: number }).status !== 401) throw e;
      }
      if (!current || !current.onboardingCompletedAt) {
        await signIn({
          registrationHandle: draft.handle,
          existingIdentity: !!current || !!draft.boundUserId,
          setup: {
            avatar: draft.avatar,
            gender: draft.gender,
            vibe: draft.vibe,
            backgroundId: draft.backgroundId,
            interests: draft.interests,
          },
        });
        current = await api<UserProfile>("users/me");
      }
      if (
        current.handle !== draft.handle ||
        (draft.boundUserId && current.id !== draft.boundUserId)
      )
        throw new Error(
          "The signed-in identity changed. Sign out before continuing setup.",
        );
      if (current.onboardingCompletedAt) {
        await clearDraft();
        await onDone();
        return;
      }
      if (draft.step === "passkey") {
        const bound = {
          ...ready,
          boundUserId: current.id,
          baseVersion: current.profileVersion,
          step: "interests" as const,
        };
        await saveDraft(bound);
        setDraft(bound);
        return;
      }
      await finishPendingOnboarding(current);
      await onDone();
    });
  }
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
      "Customize it or keep your generated look.",
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
      "Create your identity with a secure, password-free sign-in. Then choose your interests.",
    ],
  };
  const splash = draft.step === "splash";
  const welcome = draft.step === "welcome";
  const h = headers[draft.step] ?? headers.passkey;
  const action = (label: string, task: () => void, secondary = false) => (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      accessibilityState={{ disabled: busy }}
      onPress={task}
      style={[
        secondary ? styles.secondary : styles.primary,
        busy && { opacity: 0.5 },
      ]}
    >
      <Text style={secondary ? styles.secondaryText : styles.primaryText}>
        {label}
      </Text>
    </Pressable>
  );
  if (!editing && profile && !profile.onboardingCompletedAt)
    return (
      <SafeAreaView style={styles.root}>
        <Stack.Screen options={{ statusBarStyle: "light" }} />
        <View style={{ padding: 28, gap: 20 }}>
          <Wordmark />
          <Text style={styles.title}>Finish your setup.</Text>
          <Text style={styles.description}>
            Continue in your secure browser to save a recovery credential,
            choose interests and communities, then review your profile.
          </Text>
          {!!error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          )}
          {action(
            busy ? "One moment…" : "Continue setup in browser",
            () =>
              void run(async () => {
                await signIn({
                  registrationHandle: draft.handle,
                  existingIdentity: true,
                  setup: {
                    avatar: draft.avatar,
                    gender: draft.gender,
                    vibe: draft.vibe,
                    backgroundId: draft.backgroundId,
                    interests: draft.interests,
                  },
                });
                await clearDraft();
                await onDone();
              }),
          )}
        </View>
      </SafeAreaView>
    );
  return (
    <ImageBackground
      source={backgroundSources.ember}
      style={styles.root}
      imageStyle={{ opacity: splash ? 0.85 : 0.08 }}
    >
      <Stack.Screen options={{ statusBarStyle: "light" }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <SafeAreaView style={{ flex: 1 }}>
          {splash ? (
            <View style={styles.splash}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Skip intro"
                onPress={() => change({ step: "welcome" })}
                style={styles.skip}
              >
                <Text style={styles.muted}>Skip intro</Text>
              </Pressable>
              <BrandMark size={120} />
              <Wordmark />
              <Text style={styles.tagline}>
                REAL PEOPLE. OPEN CONVERSATIONS.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.top}>
                {welcome ? (
                  <Wordmark />
                ) : (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Back"
                      disabled={
                        (!editing &&
                          !!draft.boundUserId &&
                          draft.step === "passkey") ||
                        busy ||
                        index === 0 ||
                        (!editing &&
                          !!draft.boundUserId &&
                          draft.step === "interests")
                      }
                      onPress={() => {
                        Keyboard.dismiss();
                        change({ step: steps[Math.max(0, index - 1)] });
                      }}
                    >
                      <Text style={styles.back}>←</Text>
                    </Pressable>
                    <Text style={styles.topLabel}>
                      {editing ? "YOUR PREFERENCES" : "MAKE YOURSELF AT HOME"}
                    </Text>
                    {editing && (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() =>
                          void run(async () => {
                            await clearDraft();
                            onCancel?.();
                          })
                        }
                      >
                        <Text>Cancel</Text>
                      </Pressable>
                    )}
                  </>
                )}
              </View>
              {!welcome && (
                <View
                  accessible
                  accessibilityRole="progressbar"
                  accessibilityLabel="Setup progress"
                  accessibilityValue={{
                    min: 0,
                    max: steps.length - 1,
                    now: index,
                  }}
                  style={styles.track}
                >
                  <View
                    style={[
                      styles.progress,
                      {
                        width: `${Math.max(8, (index / (steps.length - 1)) * 100)}%`,
                      },
                    ]}
                  />
                </View>
              )}
              <ScrollView
                style={{ flex: 1 }}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.content}
              >
                {welcome ? (
                  <>
                    <View style={styles.collage}>
                      <ImageBackground
                        source={backgroundSources.city}
                        style={[
                          styles.collageTile,
                          { transform: [{ rotate: "-12deg" }] },
                        ]}
                      />
                      <ImageBackground
                        source={backgroundSources.botanical}
                        style={[
                          styles.collageTile,
                          { transform: [{ rotate: "10deg" }] },
                        ]}
                      />
                      <ImageBackground
                        source={backgroundSources.midnight}
                        style={[
                          styles.collageTile,
                          { transform: [{ rotate: "-8deg" }] },
                        ]}
                      />
                    </View>
                    <Text style={styles.welcomeTitle}>
                      Real People.{"\n"}
                      <Text
                        style={[styles.welcomeTitle, { color: brand.orange }]}
                      >
                        Open{"\n"}Conversations.
                      </Text>
                    </Text>
                    <Text style={styles.description}>
                      A space where you can be yourself, share freely, and find
                      communities that truly get you.
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.kicker}>{h[0]}</Text>
                    <Text accessibilityRole="header" style={styles.title}>
                      {h[1]}
                    </Text>
                    <Text style={styles.description}>{h[2]}</Text>
                  </>
                )}
                {draft.step === "gender" && (
                  <View style={styles.options}>
                    {ONBOARDING_GENDERS.map((g) => (
                      <Pressable
                        key={g.id}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: draft.gender === g.id }}
                        onPress={() => change({ gender: g.id })}
                        style={[
                          styles.radio,
                          draft.gender === g.id && styles.selected,
                        ]}
                      >
                        <Text style={styles.symbol}>{g.symbol}</Text>
                        <Text style={{ flex: 1 }}>{g.label}</Text>
                        <View
                          style={[
                            styles.dot,
                            draft.gender === g.id && styles.dotSelected,
                          ]}
                        />
                      </Pressable>
                    ))}
                    {action(
                      "Skip for now",
                      () => {
                        change({ gender: null });
                        next();
                      },
                      true,
                    )}
                  </View>
                )}
                {draft.step === "vibe" && (
                  <View style={styles.grid}>
                    {ONBOARDING_VIBES.map((v) => (
                      <Pressable
                        key={v.id}
                        accessibilityRole="radio"
                        accessibilityLabel={v.label}
                        accessibilityState={{ checked: draft.vibe === v.id }}
                        onPress={() =>
                          change({ vibe: v.id, backgroundId: v.backgroundId })
                        }
                        style={[
                          styles.vibe,
                          draft.vibe === v.id && styles.selected,
                        ]}
                      >
                        <ImageBackground
                          source={backgroundSources[v.backgroundId]}
                          style={styles.vibeImage}
                        >
                          <View style={styles.vibeLabel}>
                            <Text style={styles.cardTitle}>{v.label}</Text>
                            <Text style={styles.cardSmall}>
                              {v.description}
                            </Text>
                          </View>
                        </ImageBackground>
                      </Pressable>
                    ))}
                  </View>
                )}
                {draft.step === "background" && (
                  <View style={styles.grid}>
                    {ONBOARDING_BACKGROUNDS.map((bg) => (
                      <Pressable
                        key={bg.id}
                        accessibilityRole="radio"
                        accessibilityLabel={bg.label}
                        accessibilityState={{
                          checked: draft.backgroundId === bg.id,
                        }}
                        onPress={() => change({ backgroundId: bg.id })}
                        style={[
                          styles.background,
                          draft.backgroundId === bg.id && styles.selected,
                        ]}
                      >
                        <ImageBackground
                          source={backgroundSources[bg.id]}
                          style={styles.backgroundImage}
                        >
                          <Text style={styles.backgroundLabel}>{bg.label}</Text>
                        </ImageBackground>
                      </Pressable>
                    ))}
                  </View>
                )}
                {draft.step === "preview" && (
                  <ImageBackground
                    source={backgroundSources[draft.backgroundId]}
                    style={styles.preview}
                    imageStyle={{ opacity: 0.65 }}
                  >
                    <View style={styles.previewTabs}>
                      <Text style={styles.previewFeed}>Feed</Text>
                      <Text style={styles.cardSmall}>Discover</Text>
                      <Text style={styles.cardSmall}>Communities</Text>
                    </View>
                    <View style={styles.previewPost}>
                      <Text style={styles.previewHandle}>
                        🦦 @{draft.handle}
                      </Text>
                      <Text style={styles.cardSmall}>
                        Sample post · appearance preview
                      </Text>
                      <Text style={{ lineHeight: 21 }}>
                        Some days are just better with good people and great
                        conversations.
                      </Text>
                      <ImageBackground
                        source={backgroundSources.city}
                        style={styles.previewPhoto}
                      />
                      <Text style={styles.cardSmall}>
                        Your space. Your perspective.
                      </Text>
                    </View>
                  </ImageBackground>
                )}
                {draft.step === "username" && (
                  <View style={styles.options}>
                    <Text style={styles.label}>Username</Text>
                    <TextInput
                      accessibilityLabel="Username"
                      value={draft.handle}
                      onChangeText={(handle) =>
                        change({ handle: handle.toLowerCase() })
                      }
                      maxLength={40}
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={styles.input}
                    />
                    <Text style={styles.cardSmall}>
                      3–40 lowercase letters, numbers or underscores.
                      Availability is confirmed at sign-up.
                    </Text>
                    {draft.suggestions.map((handle) => (
                      <Pressable
                        key={handle}
                        accessibilityRole="radio"
                        accessibilityLabel={handle}
                        accessibilityState={{
                          checked: draft.handle === handle,
                        }}
                        onPress={() => change({ handle })}
                        style={styles.handle}
                      >
                        <Text style={{ flex: 1 }}>{handle}</Text>
                        <View
                          style={[
                            styles.dot,
                            draft.handle === handle && styles.dotSelected,
                          ]}
                        />
                      </Pressable>
                    ))}
                  </View>
                )}
                {draft.step === "interests" && (
                  <View style={styles.chips}>
                    {INTERESTS.map((interest) => (
                      <Pressable
                        key={interest.id}
                        accessibilityRole="button"
                        accessibilityLabel={interest.label}
                        accessibilityState={{
                          selected: draft.interests.includes(interest.id),
                        }}
                        onPress={() =>
                          change({
                            interests: draft.interests.includes(interest.id)
                              ? draft.interests.filter((x) => x !== interest.id)
                              : [...draft.interests, interest.id],
                          })
                        }
                        style={[
                          styles.chip,
                          draft.interests.includes(interest.id) &&
                            styles.chipSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            draft.interests.includes(interest.id) && {
                              color: brand.black,
                            },
                          ]}
                        >
                          {interest.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
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
                    onSave={(value) =>
                      change({ avatar: value, step: "passkey" })
                    }
                  />
                )}
                {draft.step === "passkey" && (
                  <View style={styles.passkey}>
                    <View style={styles.keyIcon}>
                      <Image
                        source={require("../../../../assets/onboarding/fingerprint.png")}
                        style={{ width: 76, height: 76 }}
                        accessibilityIgnoresInvertColors
                      />
                    </View>
                    <Text style={styles.benefit}>
                      ◇ Faster and easier sign-in
                    </Text>
                    <Text style={styles.benefit}>
                      ◇ No password to remember
                    </Text>
                    <Text style={styles.benefit}>
                      ◇ Add a backup passkey in your profile
                    </Text>
                    <Text style={styles.description}>
                      Your identity: @{draft.handle}
                    </Text>
                  </View>
                )}
              </ScrollView>
              <View style={styles.footer}>
                {!!error && (
                  <Text accessibilityRole="alert" style={styles.error}>
                    {error}
                  </Text>
                )}
                {editing &&
                  !!error &&
                  action(
                    "Reload saved choices",
                    () =>
                      void run(async () => {
                        const current = await api<UserProfile>("users/me");
                        setDraft(await newDraft(current));
                      }),
                    true,
                  )}
                {draft.step === "username" && (
                  <Text style={styles.finePrint}>
                    Your handle stays stable. Your display name can change.
                  </Text>
                )}
                {draft.step !== "avatar" &&
                  action(
                    busy
                      ? "One moment…"
                      : draft.step === "passkey"
                        ? draft.boundUserId
                          ? "Resume setup"
                          : "Set up passkey"
                        : draft.step === "interests"
                          ? editing
                            ? "Save preferences"
                            : "Complete setup"
                          : welcome
                            ? "Get Started"
                            : "Continue",
                    () => {
                      if (
                        draft.step === "passkey" ||
                        draft.step === "interests"
                      )
                        void finish();
                      else next();
                    },
                  )}
                {welcome &&
                  action(
                    "Already here? Sign in",
                    () =>
                      void run(async () => {
                        await clearDraft();
                        await signIn();
                        await onDone();
                      }),
                    true,
                  )}
              </View>
            </>
          )}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.black },
  loading: {
    flex: 1,
    backgroundColor: brand.black,
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
  },
  text: { fontFamily: "Inter", color: "#fff", fontSize: 14 },
  muted: { color: brand.muted },
  splash: { flex: 1, justifyContent: "center", alignItems: "center", gap: 24 },
  skip: { position: "absolute", right: 24, top: 20 },
  tagline: { fontSize: 8, letterSpacing: 1.7 },
  top: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  topLabel: {
    fontSize: 8,
    letterSpacing: 1.5,
    color: brand.muted,
    flex: 1,
    textAlign: "center",
  },
  back: { fontSize: 24 },
  track: {
    height: 4,
    backgroundColor: "#262626",
    marginHorizontal: 24,
    borderRadius: 4,
    overflow: "hidden",
  },
  progress: { height: 4, borderRadius: 4, backgroundColor: brand.orange },
  content: { padding: 24, gap: 16 },
  kicker: { fontSize: 12, color: brand.muted, marginTop: 10 },
  title: {
    fontFamily: "Chillax",
    fontSize: 30,
    fontWeight: "600",
    lineHeight: 37,
    letterSpacing: -0.8,
  },
  description: { fontSize: 13, color: brand.muted, lineHeight: 21 },
  welcomeTitle: {
    fontFamily: "Chillax",
    fontSize: 38,
    fontWeight: "600",
    lineHeight: 45,
    letterSpacing: -1.2,
  },
  collage: {
    height: 170,
    flexDirection: "row",
    gap: 10,
    marginHorizontal: -24,
    overflow: "hidden",
    opacity: 0.6,
  },
  collageTile: {
    width: "34%",
    height: 180,
    borderRadius: 12,
    overflow: "hidden",
  },
  options: { gap: 12, marginTop: 12 },
  radio: {
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
    padding: 18,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 14,
    backgroundColor: "#171717",
  },
  selected: { borderColor: brand.orange, borderWidth: 2 },
  symbol: { fontSize: 24, color: brand.orange },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#a3a3a3",
  },
  dotSelected: {
    backgroundColor: brand.orange,
    borderColor: "#fff",
    borderWidth: 2,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 12,
  },
  vibe: {
    width: "31%",
    height: 220,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 16,
    overflow: "hidden",
  },
  vibeImage: { flex: 1, justifyContent: "flex-end" },
  vibeLabel: { padding: 10, backgroundColor: "#0009", gap: 5 },
  cardTitle: { fontFamily: "Chillax", fontSize: 14, fontWeight: "600" },
  cardSmall: { fontSize: 10, lineHeight: 16, color: brand.muted },
  background: {
    width: "30.8%",
    aspectRatio: 0.75,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 12,
    overflow: "hidden",
  },
  backgroundImage: { flex: 1, justifyContent: "flex-end" },
  backgroundLabel: { fontSize: 10, padding: 7, backgroundColor: "#0009" },
  preview: {
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 8,
  },
  previewTabs: {
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0008",
  },
  previewFeed: {
    fontSize: 10,
    backgroundColor: brand.orange,
    color: brand.black,
    padding: 8,
    borderRadius: 20,
  },
  previewPost: { padding: 14, gap: 12, backgroundColor: "#0b0b0be8" },
  previewHandle: { fontSize: 12, color: brand.orange },
  previewPhoto: { height: 160, borderRadius: 10, overflow: "hidden" },
  label: { fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: "#fff",
    fontFamily: "Inter",
    backgroundColor: "#171717",
  },
  handle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  chip: {
    borderWidth: 1,
    borderColor: "#3a3a3a",
    backgroundColor: "#191919",
    borderRadius: 30,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  chipSelected: { backgroundColor: brand.orange, borderColor: brand.orange },
  chipText: { fontSize: 12 },
  passkey: { gap: 20, marginTop: 15 },
  keyIcon: {
    width: 110,
    height: 110,
    borderRadius: 24,
    backgroundColor: "#23170f",
    alignItems: "center",
    justifyContent: "center",
  },
  benefit: { fontSize: 13, lineHeight: 20 },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: brand.black,
    gap: 8,
  },
  primary: {
    minHeight: 50,
    borderRadius: 13,
    backgroundColor: brand.orange,
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
  },
  primaryText: { color: brand.black, fontSize: 14, fontWeight: "600" },
  secondary: {
    minHeight: 40,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { color: brand.muted, fontSize: 12 },
  finePrint: {
    fontSize: 10,
    color: brand.muted,
    lineHeight: 16,
    textAlign: "center",
  },
  error: {
    color: "#fda4af",
    fontSize: 12,
    lineHeight: 18,
    padding: 10,
    backgroundColor: "#fb718512",
    borderRadius: 10,
  },
});
