import { useState } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { View, Text, Pressable, ScrollView, Modal } from "../theme/primitives";
import { SafeAreaView } from "../theme/primitives";
import * as Crypto from "expo-crypto";
import {
  AVATAR_OPTIONS,
  AVATAR_LABELS,
  generateAvatar,
  avatarOrFallback,
  type AvatarAttribute,
} from "@circle/avatar-engine";
import type { AvatarSpec, AvatarRecord } from "@circle/shared-types";
import Avatar from "./avatar";
import { api } from "../lib/session";
export function AvatarEditor({
  initial,
  defaultSeed,
  onSave,
  onCancel,
  cancelLabel = "Cancel",
}: {
  initial: AvatarSpec;
  defaultSeed?: string;
  onSave: (v: AvatarSpec) => Promise<void> | void;
  onCancel: () => void;
  cancelLabel?: string;
}) {
  const safe = avatarOrFallback(initial),
    [value, setValue] = useState<AvatarSpec>({
      version: 1,
      seed: safe.seed,
      config: { ...safe.config },
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const button = (label: string, action: () => void) => (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={action}
      style={s.button}
    >
      <Text style={s.buttonText}>{label}</Text>
    </Pressable>
  );
  const { height } = useWindowDimensions();
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => {
        if (!busy) onCancel();
      }}
    >
      <SafeAreaView style={s.editor} edges={["top", "bottom"]}>
        <View style={s.header}>
          <Text accessibilityRole="header" style={s.title}>
            Make your avatar yours.
          </Text>
          <Text style={s.caption}>See every change as you choose.</Text>
        </View>
        <View style={s.preview}>
          <Avatar
            avatar={value}
            size={height < 740 ? 112 : 160}
            label="Avatar preview"
          />
          <View style={s.actions}>
            {button("Generate Again", () => {
              let next: AvatarSpec;
              do {
                next = generateAvatar(Crypto.randomUUID());
              } while (
                JSON.stringify(next.config) === JSON.stringify(value.config)
              );
              setValue(next);
            })}
            {button("Reset avatar", () =>
              setValue(generateAvatar(defaultSeed ?? initial.seed)),
            )}
          </View>
        </View>
        <ScrollView
          style={s.options}
          contentContainerStyle={s.optionsContent}
          keyboardShouldPersistTaps="handled"
          accessibilityLabel="Avatar options"
        >
          {(Object.keys(AVATAR_OPTIONS) as AvatarAttribute[]).map((key) => (
            <View key={key} style={{ alignSelf: "stretch", gap: 10 }}>
              <Text style={s.label}>{AVATAR_LABELS[key]}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
              >
                {AVATAR_OPTIONS[key].map((o) => (
                  <Pressable
                    key={o.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${AVATAR_LABELS[key]}: ${o.label}`}
                    accessibilityState={{
                      selected: value.config[key] === o.id,
                    }}
                    disabled={busy}
                    onPress={() =>
                      setValue((v) => ({
                        ...v,
                        config: { ...v.config, [key]: o.id },
                      }))
                    }
                    style={[
                      s.option,
                      value.config[key] === o.id && {
                        borderColor: "#FF5A0A",
                        backgroundColor: "#3b2015",
                      },
                    ]}
                  >
                    <Text style={s.label}>{o.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ))}
        </ScrollView>
        {error && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
        <View style={[s.actions, s.footer]}>
          {button(cancelLabel, onCancel)}
          {button(busy ? "Saving…" : "Save avatar", () => {
            setBusy(true);
            setError("");
            Promise.resolve()
              .then(() => onSave(value))
              .catch((e) =>
                setError(
                  e.status === 409
                    ? "Avatar changed on another device. Cancel and reopen to reload."
                    : e.message,
                ),
              )
              .finally(() => setBusy(false));
          })}
        </View>
      </SafeAreaView>
    </Modal>
  );
}
export default function AvatarSettings({
  onSaved,
}: {
  onSaved: () => Promise<void> | void;
}) {
  const [record, setRecord] = useState<AvatarRecord | null>(null),
    [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        disabled={loading}
        style={s.button}
        onPress={() => {
          setLoading(true);
          setError("");
          void api<AvatarRecord>("avatars/me")
            .then((r) => {
              setRecord(r);
              setOpen(true);
            })
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
        }}
      >
        <Text style={s.buttonText}>
          {loading ? "Opening avatar…" : "Customize avatar"}
        </Text>
      </Pressable>
      {error && <Text style={s.error}>{error}</Text>}
      {open && record && (
        <AvatarEditor
          key={record.revision}
          initial={record}
          defaultSeed={record.defaultSeed}
          onCancel={() => setOpen(false)}
          onSave={async (value) => {
            setRecord(
              await api<AvatarRecord>("avatars/me", "PATCH", {
                version: 1,
                seed: value.seed,
                config: value.config,
                revision: record.revision,
              }),
            );
            await onSaved();
            setOpen(false);
          }}
        />
      )}
    </View>
  );
}
const s = StyleSheet.create({
  editor: { flex: 1, backgroundColor: "#0b0b0b" },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 6,
    borderBottomWidth: 1,
    borderColor: "#2a2a2a",
  },
  title: { fontSize: 22, fontWeight: "700", color: "#fff" },
  preview: {
    alignItems: "center",
    padding: 16,
    gap: 14,
    borderBottomWidth: 1,
    borderColor: "#2a2a2a",
    backgroundColor: "#111",
  },
  options: { flex: 1 },
  optionsContent: { padding: 20, gap: 24 },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderColor: "#2a2a2a",
    justifyContent: "space-between",
    backgroundColor: "#111",
  },
  caption: { color: "#a3a3a3", fontSize: 13 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  button: {
    backgroundColor: "#FF5A0A",
    padding: 13,
    borderRadius: 24,
    alignItems: "center",
  },
  buttonText: { color: "#111", fontWeight: "700", fontSize: 13 },
  label: { color: "#fff", fontSize: 13 },
  option: {
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 20,
    padding: 12,
  },
  error: { color: "#ffb092", padding: 12 },
  modal: {
    padding: 24,
    paddingTop: 40,
    backgroundColor: "#0b0b0b",
    flexGrow: 1,
  },
});
