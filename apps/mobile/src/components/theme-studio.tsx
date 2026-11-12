import { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Image,
  Switch,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Slider from "@react-native-community/slider";
import { SvgXml } from "react-native-svg";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import type {
  ThemeConfig,
  ThemeDraft,
  ThemeLibrary,
  ThemeState,
  SavedTheme,
} from "@circle/shared-types";
import {
  DEFAULT_THEME,
  THEME_PALETTES,
  THEME_COLOR_LABELS,
  themeBackgroundSvg,
  themeContrastIssues,
} from "@circle/design-tokens";
import { ONBOARDING_BACKGROUNDS } from "@circle/constants";
import { backgroundSources } from "../lib/onboarding";
import { api, uploadMedia, authenticatedMediaSource } from "../lib/session";
import { ThemeScope } from "../theme/store";
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const initial: ThemeDraft = {
  name: "My Circle",
  description: "",
  config: clone(DEFAULT_THEME),
};
const categories = [
  "Backgrounds",
  "Colors",
  "Gradients",
  "Patterns",
  "Components",
  "Typography",
  "Effects",
  "Details",
] as const;
function Button({
  label,
  onPress,
  disabled = false,
  selected = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={{
        padding: 10,
        minHeight: 42,
        borderRadius: 9,
        borderWidth: 1,
        borderColor: selected ? "#FF6A00" : "#666",
        backgroundColor: selected ? "#392014" : "#222",
        opacity: disabled ? 0.45 : 1,
        margin: 3,
      }}
    >
      <Text style={{ color: "#FFF", fontFamily: "Inter", fontSize: 12 }}>
        {label}
      </Text>
    </Pressable>
  );
}
function Range({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
}) {
  return (
    <View style={{ marginVertical: 8 }}>
      <Text style={{ color: "#DDD", fontSize: 12 }}>
        {label} · {Number(value.toFixed(2))}
      </Text>
      <Slider
        accessibilityLabel={label}
        value={value}
        minimumValue={min}
        maximumValue={max}
        step={step}
        minimumTrackTintColor="#FF6A00"
        thumbTintColor="#FF6A00"
        onSlidingComplete={onChange}
      />
    </View>
  );
}
function HexColor({
  label,
  color,
  onChange,
}: {
  label: string;
  color: string;
  onChange: (v: string) => void;
}) {
  const [text, setText] = useState(color),
    [expanded, setExpanded] = useState(false);
  useEffect(() => setText(color), [color]);
  return (
    <View style={{ marginVertical: 8 }}>
      <Text style={{ color: "#DDD", fontSize: 12 }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} color picker`}
          onPress={() => setExpanded(!expanded)}
          style={{
            width: 40,
            height: 40,
            backgroundColor: color,
            borderWidth: 1,
            borderColor: "#888",
            borderRadius: 8,
          }}
        />
        <TextInput
          accessibilityLabel={`${label} HEX`}
          value={text}
          maxLength={7}
          autoCapitalize="characters"
          onChangeText={(v) => {
            setText(v);
            if (/^#[0-9a-f]{6}$/i.test(v)) onChange(v);
          }}
          onBlur={() => setText(color)}
          style={{
            flex: 1,
            padding: 10,
            borderWidth: 1,
            borderColor: "#777",
            borderRadius: 8,
            color: "#FFF",
          }}
        />
      </View>
      {expanded &&
        ["Red", "Green", "Blue"].map((name, i) => (
          <Range
            key={name}
            label={name}
            value={parseInt(color.slice(1 + i * 2, 3 + i * 2), 16)}
            min={0}
            max={255}
            onChange={(n) =>
              onChange(
                color.slice(0, 1 + i * 2) +
                  n.toString(16).padStart(2, "0") +
                  color.slice(3 + i * 2),
              )
            }
          />
        ))}
    </View>
  );
}
function Preview({ t }: { t: ThemeConfig }) {
  const [page, setPage] = useState("Feed"),
    [liked, setLiked] = useState(false),
    [source, setSource] = useState<{
      uri: string;
      headers: Record<string, string>;
    } | null>(null);
  useEffect(() => {
    let live = true;
    if (t.background.imageId)
      void authenticatedMediaSource("/v1/media/" + t.background.imageId)
        .then((s) => {
          if (live) setSource(s);
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [t.background.imageId]);
  const c = t.colors;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.primaryBackground,
        borderRadius: t.effects.radius,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: c.border,
      }}
    >
      <View pointerEvents="none" style={{ position: "absolute", inset: 0 }}>
        <SvgXml
          xml={themeBackgroundSvg(t, 600, 500)}
          width="100%"
          height="100%"
        />
        {t.background.type === "image" && source && (
          <Image
            source={source}
            style={{
              position: "absolute",
              inset: 0,
              opacity: t.background.opacity * t.background.intensity * 0.15,
            }}
          />
        )}
      </View>
      <ScrollView contentContainerStyle={{ padding: 14 }}>
        <Text
          style={{
            color: c.primaryText,
            fontFamily:
              t.typography.family === "rounded"
                ? "Chillax"
                : t.typography.family === "system"
                  ? undefined
                  : "Inter",
            fontSize: t.typography.baseSize + 3,
            fontWeight: "700",
          }}
        >
          Circle<Text style={{ color: "#FF6A00" }}>.social</Text>
        </Text>
        <View
          style={{
            flexDirection: "row",
            marginVertical: 10,
            backgroundColor: c.navigationBackground,
            borderRadius: t.effects.radius,
          }}
        >
          {["Feed", "Community", "Profile", "Post"].map((x) => (
            <Pressable
              accessibilityRole="button"
              key={x}
              onPress={() => setPage(x)}
              style={{
                padding: 7,
                flex: 1,
                borderRadius: t.effects.radius,
                backgroundColor:
                  page === x ? c.navigationActive : "transparent",
              }}
            >
              <Text
                style={{
                  color: page === x ? c.buttonText : c.primaryText,
                  fontSize: 10,
                }}
              >
                {x}
              </Text>
            </Pressable>
          ))}
        </View>
        <View
          style={{
            backgroundColor: c.surface,
            borderColor: c.border,
            borderWidth: 1,
            borderRadius: t.effects.radius,
            padding: 14,
            shadowOpacity: t.effects.shadows ? 0.15 : 0,
            shadowRadius: 8,
          }}
        >
          <Text style={{ color: c.secondaryAccent, fontSize: 11 }}>
            {page === "Community" ? "Bhasar · Your circle" : "quiet_otter_4821"}
          </Text>
          <Text
            style={{
              color: c.primaryText,
              fontSize: t.typography.baseSize,
              lineHeight: t.typography.baseSize * t.typography.lineHeight,
              marginVertical: 8,
            }}
          >
            {page === "Profile"
              ? "A new voice in the conversation."
              : page === "Community"
                ? "A space for everyday voices and open conversations."
                : page === "Post"
                  ? "Share what’s on your mind…"
                  : "Some days are better with good people and great conversations."}
          </Text>
          {page === "Post" ? (
            <TextInput
              accessibilityLabel="Preview post"
              placeholder="Write a thought"
              placeholderTextColor={c.secondaryText}
              style={{
                backgroundColor: c.inputBackground,
                borderColor: c.inputBorder,
                borderWidth: 1,
                color: c.primaryText,
                padding: 10,
                borderRadius: t.effects.radius,
              }}
            />
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => setLiked(!liked)}
            >
              <Text style={{ color: c.primaryAccent }}>
                {liked ? "♥ 25" : "♡ 24"} · Join the conversation
              </Text>
            </Pressable>
          )}
          <Text style={{ color: c.secondaryText, fontSize: 11, marginTop: 10 }}>
            Your people. Your Circle.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
export default function ThemeSettings({
  onApplied,
}: {
  onApplied: () => Promise<void>;
}) {
  const { width, height } = useWindowDimensions(),
    wide = width > 850;
  const [library, setLibrary] = useState<ThemeLibrary | null>(null),
    [state, setState] = useState<ThemeState | null>(null),
    [open, setOpen] = useState(false),
    [draft, setDraft] = useState<ThemeDraft>(initial),
    [editing, setEditing] = useState<SavedTheme | null>(null),
    [undo, setUndo] = useState<ThemeDraft[]>([]),
    [redo, setRedo] = useState<ThemeDraft[]>([]),
    [category, setCategory] =
      useState<(typeof categories)[number]>("Backgrounds"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [deleted, setDeleted] = useState<{ id: string; revision: number } | null>(
      null,
    );
  async function load() {
    const [l, s] = await Promise.all([
      api<ThemeLibrary>("themes"),
      api<ThemeState>("themes/state"),
    ]);
    setLibrary(l);
    setState(s);
  }
  useEffect(() => {
    void load().catch(() => setMessage("Could not load themes."));
  }, []);
  function change(v: ThemeDraft) {
    setUndo((x) => [...x.slice(-49), clone(draft)]);
    setRedo([]);
    setDraft(v);
    setMessage("");
  }
  const config = (v: ThemeConfig) => change({ ...draft, config: v });
  function start(item: SavedTheme | null) {
    setEditing(item);
    setDraft(
      item
        ? {
            name: item.name,
            description: item.description,
            config: clone(item.config),
          }
        : clone(initial),
    );
    setUndo([]);
    setRedo([]);
    setMessage("");
    setOpen(true);
  }
  async function perform(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      if ((e as { status?: number }).status === 409)
        await load().catch(() => {});
      setMessage(e instanceof Error ? e.message : "Unable to save theme.");
    } finally {
      setBusy(false);
    }
  }
  async function save(apply: boolean) {
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
    setMessage(apply ? "Theme saved and applied." : "Theme saved.");
  }
  const t = draft.config,
    issues = themeContrastIssues(t),
    disabled =
      busy ||
      issues.length > 0 ||
      !draft.name.trim() ||
      (t.background.type === "image" && !t.background.imageId);
  const details = (
    <>
      <Text style={{ color: "#FFF", fontSize: 18, fontWeight: "700" }}>
        Theme details
      </Text>
      <TextInput
        accessibilityLabel="Theme name"
        placeholder="Theme name"
        placeholderTextColor="#BBB"
        maxLength={60}
        value={draft.name}
        onChangeText={(name) => change({ ...draft, name })}
        style={{
          color: "#FFF",
          borderWidth: 1,
          borderColor: "#777",
          borderRadius: 8,
          padding: 10,
          marginVertical: 10,
        }}
      />
      <TextInput
        accessibilityLabel="Theme description"
        placeholder="Description"
        placeholderTextColor="#BBB"
        maxLength={180}
        value={draft.description}
        onChangeText={(description) => change({ ...draft, description })}
        style={{
          color: "#FFF",
          borderWidth: 1,
          borderColor: "#777",
          borderRadius: 8,
          padding: 10,
        }}
      />
      <View
        style={{ flexDirection: "row", flexWrap: "wrap", marginVertical: 10 }}
      >
        {Object.entries(t.colors).map(([k, c]) => (
          <View
            key={k}
            accessibilityLabel={
              THEME_COLOR_LABELS[k as keyof ThemeConfig["colors"]]
            }
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: c,
              borderWidth: 1,
              borderColor: "#999",
              margin: 3,
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <Button
          label="Undo"
          disabled={!undo.length || busy}
          onPress={() => {
            setRedo((x) => [draft, ...x]);
            setDraft(undo[undo.length - 1]);
            setUndo((x) => x.slice(0, -1));
          }}
        />
        <Button
          label="Redo"
          disabled={!redo.length || busy}
          onPress={() => {
            setUndo((x) => [...x, draft]);
            setDraft(redo[0]);
            setRedo((x) => x.slice(1));
          }}
        />
        <Button
          label="Reset"
          disabled={busy}
          onPress={() => change(clone(initial))}
        />
        <Button
          label="Duplicate"
          disabled={busy}
          onPress={() => {
            change({
              ...clone(draft),
              name: draft.name.slice(0, 54) + " copy",
            });
            setEditing(null);
          }}
        />
      </View>
      <Text style={{ color: "#FFBB8A", marginVertical: 12 }}>
        {issues.length ? issues.join("\n") : "✓ Readable text contrast"}
      </Text>
    </>
  );
  return (
    <View
      style={{
        marginVertical: 20,
        backgroundColor: "#101010",
        padding: 14,
        borderRadius: 14,
      }}
    >
      <Text style={{ color: "#FF9E58", fontSize: 18, fontWeight: "700" }}>
        App themes
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {ONBOARDING_BACKGROUNDS.map((bg) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Use ${bg.label} default`}
            accessibilityState={{
              selected:
                !state?.activeTheme && state?.defaultBackgroundId === bg.id,
            }}
            disabled={busy}
            key={bg.id}
            onPress={() =>
              void perform(async () => {
                const fresh = await api<ThemeState>("themes/state");
                setState(
                  await api<ThemeState>("themes/default", "POST", {
                    themeVersion: fresh.themeVersion,
                    backgroundId: bg.id,
                  }),
                );
                await onApplied();
              })
            }
            style={{
              width: "30%",
              margin: "1.5%",
              borderWidth: 1,
              borderColor:
                !state?.activeTheme && state?.defaultBackgroundId === bg.id
                  ? "#FF6A00"
                  : "#777",
              borderRadius: 10,
              overflow: "hidden",
              backgroundColor: "#171717",
            }}
          >
            <Image
              source={backgroundSources[bg.id]}
              style={{ width: "100%", height: 65 }}
            />
            <Text style={{ color: "#FFF", padding: 6, fontSize: 11 }}>
              {bg.label}
            </Text>
          </Pressable>
        ))}
        <Button label="＋ Create Your Own Theme" onPress={() => start(null)} />
      </View>
      {library?.items.map((item) => (
        <View
          key={item.id}
          style={{
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderColor: "#777",
          }}
        >
          <Text style={{ color: "#FFAD72", fontWeight: "700" }}>
            {item.name}
            {state?.activeTheme?.id === item.id ? " · Active" : ""}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            <Button
              label="Edit"
              disabled={busy || !item.supported}
              onPress={() => start(item)}
            />
            <Button
              label="Apply"
              disabled={busy || !item.supported}
              onPress={() =>
                void perform(async () => {
                  const fresh = await api<ThemeState>("themes/state");
                  setState(
                    await api<ThemeState>(`themes/${item.id}/apply`, "POST", {
                      themeVersion: fresh.themeVersion,
                    }),
                  );
                  await onApplied();
                })
              }
            />
            <Button
              label="Duplicate"
              disabled={busy || !item.supported}
              onPress={() =>
                void perform(async () => {
                  await api(`themes/${item.id}/duplicate`, "POST", {});
                  await load();
                })
              }
            />
            <Button
              label="Delete"
              disabled={busy}
              onPress={() =>
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
            />
          </View>
        </View>
      ))}
      {deleted && (
        <Button
          label="Undo delete"
          disabled={busy}
          onPress={() =>
            void perform(async () => {
              await api(`themes/${deleted.id}/restore`, "POST", {
                revision: deleted.revision,
              });
              setDeleted(null);
              await load();
            })
          }
        />
      )}
      <Text style={{ color: "#999", fontSize: 11 }}>
        {Math.round((library?.bytesUsed ?? 0) / 1024)} KB of 2 MB used
      </Text>
      {!open && !!message && (
        <Text accessibilityLiveRegion="polite" style={{ color: "#FFAD72" }}>
          {message}
        </Text>
      )}
      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => {
          if (!busy) setOpen(false);
        }}
      >
        <ThemeScope config={null}>
          <SafeAreaView style={{ flex: 1, backgroundColor: "#0B0B0B" }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 16,
              }}
            >
              <Text
                style={{ color: "#FFF", fontFamily: "Chillax", fontSize: 22 }}
              >
                Theme Studio
              </Text>
              <Button
                label="Close studio"
                disabled={busy}
                onPress={() => setOpen(false)}
              />
            </View>
            <View style={{ flex: 1, flexDirection: wide ? "row" : "column" }}>
              <View
                style={{
                  height: wide ? "100%" : Math.min(270, height * 0.32),
                  width: wide ? "42%" : "100%",
                  padding: 12,
                }}
              >
                <Preview t={t} />
              </View>
              <View style={{ flex: 1, minHeight: 0 }}>
                <ScrollView
                  horizontal
                  style={{ maxHeight: 52 }}
                  contentContainerStyle={{
                    alignItems: "center",
                    paddingHorizontal: 8,
                  }}
                >
                  {categories.map((x) => (
                    <Button
                      key={x}
                      label={x}
                      selected={category === x}
                      onPress={() => setCategory(x)}
                    />
                  ))}
                </ScrollView>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ padding: 18, paddingBottom: 30 }}
                >
                  <Text
                    style={{
                      color: "#FFF",
                      fontSize: 18,
                      fontWeight: "700",
                      marginBottom: 8,
                    }}
                  >
                    {category}
                  </Text>
                  {category === "Backgrounds" && (
                    <>
                      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                        {(
                          [
                            "solid",
                            "linear",
                            "radial",
                            "pattern",
                            "texture",
                            "image",
                          ] as const
                        ).map((type) => (
                          <Button
                            key={type}
                            label={type}
                            selected={t.background.type === type}
                            onPress={() =>
                              config({
                                ...t,
                                background: { ...t.background, type },
                              })
                            }
                          />
                        ))}
                      </View>
                      <HexColor
                        label="Main background"
                        color={t.colors.primaryBackground}
                        onChange={(c) =>
                          config({
                            ...t,
                            colors: { ...t.colors, primaryBackground: c },
                          })
                        }
                      />
                      <Range
                        label="Opacity"
                        value={t.background.opacity}
                        min={0}
                        max={1}
                        step={0.05}
                        onChange={(opacity) =>
                          config({
                            ...t,
                            background: { ...t.background, opacity },
                          })
                        }
                      />
                      <Range
                        label="Intensity"
                        value={t.background.intensity}
                        min={0}
                        max={1}
                        step={0.05}
                        onChange={(intensity) =>
                          config({
                            ...t,
                            background: { ...t.background, intensity },
                          })
                        }
                      />
                      {t.background.type === "image" && (
                        <>
                          <Button
                            label="Upload background image"
                            disabled={busy}
                            onPress={() =>
                              void perform(async () => {
                                const permission =
                                  await ImagePicker.requestMediaLibraryPermissionsAsync();
                                if (!permission.granted)
                                  throw new Error(
                                    "Allow photo access to choose a background.",
                                  );
                                const result =
                                  await ImagePicker.launchImageLibraryAsync({
                                    mediaTypes: ["images"],
                                    quality: 0.9,
                                  });
                                if (result.canceled) return;
                                const asset = result.assets[0],
                                  file = new File(asset.uri);
                                if (file.size > 12 * 1024 * 1024)
                                  throw new Error(
                                    "Choose an image under 12 MB.",
                                  );
                                const media = await uploadMedia(
                                  await file.arrayBuffer(),
                                  asset.mimeType ?? "image/jpeg",
                                );
                                config({
                                  ...t,
                                  background: {
                                    ...t.background,
                                    imageId: media.id,
                                  },
                                });
                              })
                            }
                          />
                          <Text style={{ color: "#BBB", fontSize: 12 }}>
                            Images are softened for readable text. Maximum 12
                            MB.
                          </Text>
                        </>
                      )}
                    </>
                  )}
                  {(category === "Colors" || category === "Components") && (
                    <>
                      {category === "Colors" && (
                        <View
                          style={{ flexDirection: "row", flexWrap: "wrap" }}
                        >
                          {THEME_PALETTES.map((p) => (
                            <Button
                              key={p.id}
                              label={p.name}
                              onPress={() => config(clone(p.config))}
                            />
                          ))}
                        </View>
                      )}
                      {(
                        Object.keys(
                          THEME_COLOR_LABELS,
                        ) as (keyof ThemeConfig["colors"])[]
                      )
                        .filter(
                          (k) =>
                            category === "Colors" ||
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
                        .map((k) => (
                          <HexColor
                            key={k}
                            label={THEME_COLOR_LABELS[k]}
                            color={t.colors[k]}
                            onChange={(v) =>
                              config({ ...t, colors: { ...t.colors, [k]: v } })
                            }
                          />
                        ))}
                    </>
                  )}
                  {category === "Gradients" && (
                    <>
                      <View style={{ flexDirection: "row" }}>
                        {(["linear", "radial"] as const).map((type) => (
                          <Button
                            key={type}
                            label={type}
                            selected={t.background.type === type}
                            onPress={() =>
                              config({
                                ...t,
                                background: { ...t.background, type },
                              })
                            }
                          />
                        ))}
                      </View>
                      <Range
                        label="Direction"
                        value={t.background.angle}
                        min={0}
                        max={360}
                        onChange={(angle) =>
                          config({
                            ...t,
                            background: {
                              ...t.background,
                              angle,
                              type:
                                t.background.type === "radial"
                                  ? "radial"
                                  : "linear",
                            },
                          })
                        }
                      />
                      {t.background.stops.map((stop, i) => (
                        <View key={i}>
                          <HexColor
                            label={`Stop ${i + 1}`}
                            color={stop.color}
                            onChange={(color) =>
                              config({
                                ...t,
                                background: {
                                  ...t.background,
                                  type:
                                    t.background.type === "radial"
                                      ? "radial"
                                      : "linear",
                                  stops: t.background.stops.map((s, n) =>
                                    n === i ? { ...s, color } : s,
                                  ),
                                },
                              })
                            }
                          />
                          <Range
                            label={`Stop ${i + 1} position`}
                            value={stop.position}
                            min={0}
                            max={100}
                            onChange={(position) =>
                              config({
                                ...t,
                                background: {
                                  ...t.background,
                                  stops: t.background.stops.map((s, n) =>
                                    n === i ? { ...s, position } : s,
                                  ),
                                },
                              })
                            }
                          />
                          <Button
                            label="Remove stop"
                            disabled={t.background.stops.length <= 2}
                            onPress={() =>
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
                          />
                        </View>
                      ))}
                      <Button
                        label="Add gradient stop"
                        disabled={t.background.stops.length >= 5}
                        onPress={() =>
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
                      />
                    </>
                  )}
                  {category === "Patterns" && (
                    <>
                      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                        {(["dots", "grid", "waves", "grain"] as const).map(
                          (pattern) => (
                            <Button
                              key={pattern}
                              label={pattern}
                              selected={t.background.pattern === pattern}
                              onPress={() =>
                                config({
                                  ...t,
                                  background: {
                                    ...t.background,
                                    type:
                                      pattern === "grain"
                                        ? "texture"
                                        : "pattern",
                                    pattern,
                                  },
                                })
                              }
                            />
                          ),
                        )}
                      </View>
                      <Range
                        label="Pattern intensity"
                        value={t.background.intensity}
                        min={0}
                        max={1}
                        step={0.05}
                        onChange={(intensity) =>
                          config({
                            ...t,
                            background: { ...t.background, intensity },
                          })
                        }
                      />
                    </>
                  )}
                  {category === "Typography" && (
                    <>
                      <View style={{ flexDirection: "row" }}>
                        {(["inter", "system", "rounded"] as const).map(
                          (family) => (
                            <Button
                              key={family}
                              label={family}
                              selected={t.typography.family === family}
                              onPress={() =>
                                config({
                                  ...t,
                                  typography: { ...t.typography, family },
                                })
                              }
                            />
                          ),
                        )}
                      </View>
                      <Range
                        label="Text size"
                        value={t.typography.baseSize}
                        min={14}
                        max={18}
                        onChange={(baseSize) =>
                          config({
                            ...t,
                            typography: { ...t.typography, baseSize },
                          })
                        }
                      />
                      <Range
                        label="Line height"
                        value={t.typography.lineHeight}
                        min={1.35}
                        max={1.8}
                        step={0.05}
                        onChange={(lineHeight) =>
                          config({
                            ...t,
                            typography: { ...t.typography, lineHeight },
                          })
                        }
                      />
                    </>
                  )}
                  {category === "Effects" && (
                    <>
                      <Range
                        label="Corner radius"
                        value={t.effects.radius}
                        min={4}
                        max={28}
                        onChange={(radius) =>
                          config({ ...t, effects: { ...t.effects, radius } })
                        }
                      />
                      {(["shadows", "motion"] as const).map((k) => (
                        <View
                          key={k}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            paddingVertical: 10,
                          }}
                        >
                          <Text style={{ color: "#FFF" }}>{k}</Text>
                          <Switch
                            value={t.effects[k]}
                            onValueChange={(v) =>
                              config({
                                ...t,
                                effects: { ...t.effects, [k]: v },
                              })
                            }
                          />
                        </View>
                      ))}
                    </>
                  )}
                  {category === "Details" && details}
                </ScrollView>
              </View>
              {wide && (
                <ScrollView style={{ width: 250, padding: 16 }}>
                  {details}
                </ScrollView>
              )}
            </View>
            <View
              style={{ padding: 10, borderTopWidth: 1, borderColor: "#444" }}
            >
              <Text
                accessibilityLiveRegion="polite"
                style={{ color: "#FFBB8A", fontSize: 11 }}
              >
                {busy
                  ? "Working…"
                  : message ||
                    (issues.length
                      ? "Improve contrast before saving. See Details."
                      : "Preview only until you apply.")}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Button
                  label="Save theme"
                  disabled={disabled}
                  onPress={() => void perform(() => save(false))}
                />
                <Button
                  label="Save & apply theme"
                  disabled={disabled}
                  onPress={() => void perform(() => save(true))}
                />
              </View>
            </View>
          </SafeAreaView>
        </ThemeScope>
      </Modal>
    </View>
  );
}
