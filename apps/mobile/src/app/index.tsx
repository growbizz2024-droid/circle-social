import { useAppTheme } from "../theme/store";
import ThemeSettings from "../components/theme-studio";
import Avatar from "../components/avatar";
import AvatarSettings from "../components/avatar-editor";
import { useCallback, useState } from "react";
import {
  type TextProps,
  StyleSheet,
  useColorScheme,
  Alert,
} from "react-native";
import {
  ScrollView,
  ImageBackground,
  Text as NativeText,
  View,
  TextInput,
  Pressable,
} from "../theme/primitives";
import { Stack, useFocusEffect } from "expo-router";
import { SafeAreaView } from "../theme/primitives";
import * as WebBrowser from "expo-web-browser";
import { PROFILE_ACCENTS, PROFILE_THEMES } from "@circle/constants";
import { profileUpdateSchema } from "@circle/validation";
import type {
  UserProfile,
  ProfileUpdate,
  SessionSummary,
  PasskeySummary,
} from "@circle/shared-types";
import { brand, themes } from "@circle/design-tokens";
import HomeFeed from "../components/home-feed";
import Onboarding from "../components/onboarding";
import { finishPendingOnboarding, backgroundSources } from "../lib/onboarding";
import { Wordmark, BrandMark } from "../components/brand";
import { api, signOutLocal, webUrl } from "../lib/session";
function Text({ style, ...props }: TextProps) {
  return <NativeText {...props} style={[{ fontFamily: "Inter" }, style]} />;
}
export default function ProfileScreen() {
  const [checked, setChecked] = useState(false);
  const [accountView, setAccountView] = useState<"home" | "profile">("home");
  const [editingOnboarding, setEditingOnboarding] = useState(false);
  const [pendingOnboarding, setPendingOnboarding] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [draft, setDraft] = useState<ProfileUpdate | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [keys, setKeys] = useState<PasskeySummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const customTheme = useAppTheme();
  const system = useColorScheme();
  const dark =
    !profile ||
    draft?.profileTheme === "DARK" ||
    (draft?.profileTheme === "SYSTEM" && system === "dark");
  const palette = dark ? themes.dark : themes.light;
  const ink = palette.text;
  const paper = palette.surface;
  const accent =
    customTheme?.colors.primaryAccent ??
    PROFILE_ACCENTS[draft?.profileAccent ?? "INDIGO"];
  const load = useCallback(async () => {
    const p = await finishPendingOnboarding(await api<UserProfile>("users/me"));
    setProfile(p);
    setPendingOnboarding(!p.onboardingCompletedAt);
    setDraft({
      profileVersion: p.profileVersion,
      displayName: p.displayName,
      bio: p.bio,
      avatarId: p.avatarId,
      profileTheme: p.profileTheme,
      profileAccent: p.profileAccent,
    });
    const [s, k] = await Promise.all([
      api<SessionSummary[]>("auth/sessions"),
      api<PasskeySummary[]>("auth/passkeys"),
    ]);
    setSessions(s);
    setKeys(k);
  }, []);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void load()
        .catch((e) => {
          if (active) {
            if ((e as { status?: number }).status === 401) setProfile(null);
            else setMessage((e as Error).message);
          }
        })
        .finally(() => {
          if (active) setChecked(true);
        });
      return () => {
        active = false;
      };
    }, [load]),
  );
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e) {
      if ((e as { status?: number }).status === 401) {
        setProfile(null);
        setDraft(null);
        setSessions([]);
        setKeys([]);
      }
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const button = (
    label: string,
    action: () => Promise<void>,
    danger = false,
    disabled = false,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: busy || disabled }}
      disabled={busy || disabled}
      onPress={() => void run(action)}
      style={[
        styles.button,
        {
          backgroundColor: danger ? "#fb71851a" : brand.orange,
          opacity: busy || disabled ? 0.5 : 1,
        },
      ]}
    >
      <Text
        style={{
          color: danger ? palette.danger : brand.black,
          fontFamily: "Inter",
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
  if (!checked)
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: brand.black,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <BrandMark />
      </SafeAreaView>
    );
  if (!profile || editingOnboarding || pendingOnboarding)
    return (
      <Onboarding
        profile={
          editingOnboarding || pendingOnboarding
            ? (profile ?? undefined)
            : undefined
        }
        resumeRegistration={pendingOnboarding && !editingOnboarding}
        onDone={async () => {
          await load();
          setEditingOnboarding(false);
        }}
        onCancel={() => setEditingOnboarding(false)}
      />
    );
  if (profile.onboardingCompletedAt && accountView === "home")
    return (
      <HomeFeed profile={profile} onProfile={() => setAccountView("profile")} />
    );
  return (
    <ImageBackground
      source={backgroundSources[profile.onboarding?.backgroundId ?? "ember"]}
      style={{ flex: 1, backgroundColor: palette.background }}
      imageStyle={{ opacity: profile.onboarding?.backgroundId ? 0.14 : 0 }}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }}>
        <Stack.Screen
          options={{
            statusBarStyle: (
              customTheme ? customTheme.appearance === "dark" : dark
            )
              ? "light"
              : "dark",
          }}
        />
        {profile.onboardingCompletedAt && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setAccountView("home")}
            style={{ padding: 16 }}
          >
            <Text style={{ color: brand.orange }}>← Home feed</Text>
          </Pressable>
        )}
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.page}
        >
          <Wordmark color={ink} />
          <Text style={[styles.eyebrow, { color: palette.muted }]}>
            REAL PEOPLE. OPEN CONVERSATIONS.
          </Text>
          <Text style={[styles.title, { color: ink }]}>
            Real People.{"\n"}
            <Text
              style={{
                color: dark ? brand.orange : "#b94b00",
                fontFamily: "Chillax",
                fontWeight: "600",
              }}
            >
              Open{"\n"}Conversations.
            </Text>
          </Text>
          <>
            <View
              style={[
                styles.card,
                { backgroundColor: paper, borderColor: palette.border },
              ]}
            >
              <View style={{ alignItems: "center", padding: 16 }}>
                <Avatar
                  avatar={profile.avatar}
                  seed={profile.handle}
                  size={128}
                />
              </View>
              <Text style={[styles.heading, { color: ink }]}>
                {draft?.displayName || profile.handle}
              </Text>
              <Text style={[styles.note, { color: palette.muted }]}>
                @{profile.handle}
              </Text>
              <Text style={[styles.eyebrow, { color: palette.muted }]}>
                PROFILE
              </Text>
              <AvatarSettings
                onSaved={async () =>
                  setProfile(await api<UserProfile>("users/me"))
                }
              />
              <Text style={[styles.label, { color: ink }]}>
                Display name · optional
              </Text>
              <TextInput
                accessibilityLabel="Display name"
                maxLength={50}
                value={draft?.displayName ?? ""}
                onChangeText={(v) =>
                  setDraft((d) => (d ? { ...d, displayName: v } : d))
                }
                placeholder="What should we call you?"
                placeholderTextColor="#848490"
                style={[
                  styles.input,
                  { color: ink, borderColor: palette.border },
                ]}
              />
              <Text style={[styles.label, { color: ink }]}>Bio · optional</Text>
              <TextInput
                accessibilityLabel="Bio"
                maxLength={280}
                multiline
                value={draft?.bio ?? ""}
                onChangeText={(v) =>
                  setDraft((d) => (d ? { ...d, bio: v } : d))
                }
                placeholder="A few words about your world…"
                placeholderTextColor="#848490"
                style={[
                  styles.input,
                  {
                    color: ink,
                    borderColor: palette.border,
                    minHeight: 88,
                    textAlignVertical: "top",
                  },
                ]}
              />
              <ThemeSettings
                onApplied={async () => {
                  setProfile(await api<UserProfile>("users/me"));
                }}
              />
              <Text style={[styles.label, { color: ink }]}>Appearance</Text>
              <View style={styles.row}>
                {PROFILE_THEMES.map((theme) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: draft?.profileTheme === theme,
                    }}
                    key={theme}
                    onPress={() =>
                      setDraft((d) => (d ? { ...d, profileTheme: theme } : d))
                    }
                    style={[
                      styles.choice,
                      {
                        borderColor:
                          draft?.profileTheme === theme ? accent : "#c8c8d4",
                      },
                    ]}
                  >
                    <Text style={{ color: ink }}>{theme.toLowerCase()}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.label, { color: ink }]}>Accent</Text>
              <View style={styles.row}>
                {Object.entries(PROFILE_ACCENTS).map(([name, color]) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${name.toLowerCase()} accent`}
                    accessibilityState={{
                      selected: draft?.profileAccent === name,
                    }}
                    key={name}
                    onPress={() =>
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
                    style={[
                      styles.swatch,
                      {
                        backgroundColor: color,
                        borderWidth: draft?.profileAccent === name ? 3 : 0,
                      },
                    ]}
                  />
                ))}
              </View>
              {button("Save profile", async () => {
                const value = profileUpdateSchema.safeParse(draft);
                if (!value.success)
                  throw new Error("Please check your profile fields.");
                const p = await api<UserProfile>(
                  "users/me",
                  "PATCH",
                  value.data,
                );
                setProfile(p);
                setDraft({
                  profileVersion: p.profileVersion,
                  displayName: p.displayName,
                  bio: p.bio,
                  avatarId: p.avatarId,
                  profileTheme: p.profileTheme,
                  profileAccent: p.profileAccent,
                });
                setMessage("Profile saved.");
              })}
              {button("Reload profile", load)}
              {button("Edit your style & interests", async () => {
                setEditingOnboarding(true);
              })}
            </View>
            <View
              style={[
                styles.card,
                { backgroundColor: paper, borderColor: palette.border },
              ]}
            >
              <Text style={[styles.heading, { color: ink }]}>
                Your keys & sessions
              </Text>
              {keys.map((key) => (
                <View style={styles.device} key={key.id}>
                  <Text style={{ color: ink }}>
                    ◈{" "}
                    {key.deviceType === "multiDevice"
                      ? "Synced passkey"
                      : "Device passkey"}
                  </Text>
                  {button(
                    "Remove passkey",
                    async () => {
                      await api(
                        "auth/passkeys/" + encodeURIComponent(key.id),
                        "DELETE",
                      );
                      await load();
                    },
                    false,
                    keys.length <= 1,
                  )}
                </View>
              ))}
              {button("Manage passkeys in browser", async () => {
                await WebBrowser.openBrowserAsync(webUrl);
                await load();
              })}
              <Text style={[styles.note, { color: palette.muted }]}>
                Approximate login locations are private to your account. VPNs
                and mobile networks may show another city.
              </Text>
              {button("IP Geolocation by DB-IP", async () => {
                await WebBrowser.openBrowserAsync("https://db-ip.com");
              })}
              {sessions.map((s) => (
                <View key={s.id} style={styles.device}>
                  <Text style={{ color: ink }}>
                    {s.current ? "This app session" : "Another session"}
                  </Text>
                  <Text style={[styles.note, { color: palette.muted }]}>
                    {new Date(s.createdAt).toLocaleString()}
                  </Text>
                  <Text style={[styles.note, { color: palette.muted }]}>
                    {s.location
                      ? [s.location.city, s.location.country]
                          .filter(Boolean)
                          .join(", ") + " · approximate"
                      : "Location unavailable"}
                  </Text>
                  {button("Revoke session", async () => {
                    await api("auth/sessions/" + s.id, "DELETE");
                    if (s.current) {
                      await signOutLocal();
                      setProfile(null);
                    } else await load();
                  })}
                </View>
              ))}
              {button("Sign out", async () => {
                await api("auth/logout", "POST", {});
                await signOutLocal();
                setProfile(null);
              })}
              {button("Sign out everywhere", async () => {
                await api("auth/logout-all", "POST", {});
                await signOutLocal();
                setProfile(null);
              })}
            </View>
            <View
              style={[
                styles.card,
                { backgroundColor: paper, borderColor: palette.border },
              ]}
            >
              <Text style={[styles.heading, { color: ink }]}>Take a break</Text>
              <Text style={[styles.body, { color: ink }]}>
                Deactivation revokes all sessions and retains your identity and
                passkeys. Reactivation is not available in this milestone.
              </Text>
              <TextInput
                accessibilityLabel="Confirm handle"
                placeholder={profile.handle}
                placeholderTextColor="#848490"
                value={confirmation}
                onChangeText={setConfirmation}
                autoCapitalize="none"
                style={[
                  styles.input,
                  { color: ink, borderColor: palette.border },
                ]}
              />
              {button(
                "Deactivate account",
                async () => {
                  await new Promise<void>((resolve) => {
                    Alert.alert(
                      "Deactivate this account?",
                      "All sessions will be revoked.",
                      [
                        { text: "Cancel", style: "cancel", onPress: resolve },
                        {
                          text: "Deactivate",
                          style: "destructive",
                          onPress: () => {
                            void api("users/me/deactivate", "POST", {
                              confirmation,
                            })
                              .then(async () => {
                                await signOutLocal();
                                setProfile(null);
                                setConfirmation("");
                                setMessage("Account deactivated.");
                              })
                              .catch((e) => setMessage((e as Error).message))
                              .finally(resolve);
                          },
                        },
                      ],
                    );
                  });
                },
                true,
                confirmation !== profile.handle,
              )}
            </View>
          </>
          <Text style={[styles.note, { color: palette.muted }]}>
            A community for real conversations.
          </Text>
        </ScrollView>
        {!!message && (
          <Text
            accessibilityRole="alert"
            style={[styles.feedback, { color: ink }]}
          >
            {message}
          </Text>
        )}
      </SafeAreaView>
    </ImageBackground>
  );
}
const styles = StyleSheet.create({
  page: { padding: 24, paddingBottom: 48, gap: 20 },

  eyebrow: {
    fontSize: 10,
    letterSpacing: 2,
    color: "#a3a3a3",
    marginVertical: 8,
  },
  title: {
    fontFamily: "Chillax",
    fontSize: 40,
    lineHeight: 47,
    fontWeight: "600",
    letterSpacing: -1.5,
  },
  card: {
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: brand.border,
    gap: 12,
  },
  avatar: { fontSize: 64, textAlign: "center", padding: 12 },
  heading: {
    fontFamily: "Chillax",
    fontSize: 24,
    fontWeight: "600",
    letterSpacing: -0.6,
  },
  body: { fontFamily: "Inter", fontSize: 14, lineHeight: 23 },
  note: { fontFamily: "Inter", fontSize: 12, color: "#a3a3a3", lineHeight: 20 },
  label: {
    fontFamily: "Inter",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 12,
  },
  input: {
    padding: 14,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 12,
    fontFamily: "Inter",
    fontSize: 16,
  },
  button: {
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 6,
    minHeight: 48,
  },
  avatarRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  avatarChoice: { padding: 9, borderWidth: 2, borderRadius: 14 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  choice: { borderWidth: 1, padding: 12, borderRadius: 10 },
  swatch: { width: 36, height: 36, borderRadius: 18, borderColor: "#b8b8cf" },
  device: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: brand.border,
    gap: 8,
  },
  feedback: {
    padding: 16,
    marginHorizontal: 24,
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: "#ff6a001a",
  },
});
