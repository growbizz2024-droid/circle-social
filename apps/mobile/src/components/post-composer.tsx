import { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, AppState } from "react-native";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
} from "../theme/primitives";
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import { INTERESTS } from "@circle/constants";
import { File } from "expo-file-system";
import type {
  CommunitySummary,
  FeedPost,
  PostMedia,
} from "@circle/shared-types";
import { api, uploadMedia } from "../lib/session";
import Icon from "./feed-icons";
import PostAttachment, { LocalAudio } from "./post-media";
export default function PostComposer({
  communities,
  initialCommunity,
  onPublished,
  onClose,
}: {
  communities: CommunitySummary[];
  initialCommunity?: string;
  onPublished: (p: FeedPost) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState("choose"),
    [text, setText] = useState(""),
    [destination, setDestination] = useState(
      initialCommunity ?? communities[0]?.id ?? "",
    ),
    [media, setMedia] = useState<PostMedia[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [recorded, setRecorded] = useState<string | null>(null),
    [paused, setPaused] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const recorder = useAudioRecorder({
      ...RecordingPresets.HIGH_QUALITY,
      isMeteringEnabled: true,
    }),
    state = useAudioRecorderState(recorder, 200);
  const mediaRef = useRef<PostMedia[]>([]),
    published = useRef(false),
    mounted = useRef(true),
    localFiles = useRef<string[]>([]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void setAudioModeAsync({ allowsRecording: false });
      if (!published.current)
        mediaRef.current.forEach(
          (m) => void api(`media/${m.id}`, "DELETE").catch(() => {}),
        );
      for (const uri of localFiles.current) {
        try {
          new File(uri).delete();
        } catch {}
      }
    };
  }, []);
  async function stop() {
    try {
      await recorder.stop();
      if (recorder.uri) {
        localFiles.current.push(recorder.uri);
        setRecorded(recorder.uri);
      }
      setPaused(false);
      await setAudioModeAsync({ allowsRecording: false });
    } catch {
      setError("Recording could not be saved. Please try again.");
    }
  }
  useEffect(() => {
    if (state.isRecording && state.durationMillis >= 120000) void stop();
  }, [state.durationMillis, state.isRecording]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (status) => {
      if (status !== "active" && recorder.isRecording) void stop();
    });
    return () => sub.remove();
  }, [recorder]);
  async function upload(uri: string, mime: string) {
    const f = new File(uri);
    if (f.size > 12 * 1024 * 1024)
      throw new Error("Choose a file smaller than 12 MB.");
    const item = await uploadMedia(await f.arrayBuffer(), mime);
    if (!mounted.current) {
      void api(`media/${item.id}`, "DELETE").catch(() => {});
      return;
    }
    mediaRef.current.push(item);
    setMedia([...mediaRef.current]);
  }
  async function images() {
    setBusy(true);
    setError("");
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: 3 - mediaRef.current.length,
        quality: 0.9,
      });
      if (!result.canceled)
        for (const asset of result.assets.slice(0, 3 - mediaRef.current.length))
          await upload(asset.uri, asset.mimeType ?? "image/jpeg");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    setError("");
    try {
      if (!(await requestRecordingPermissionsAsync()).granted)
        throw new Error(
          "Microphone permission is needed to record a voice post. You can enable it in Settings.",
        );
      setRecorded(null);
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPaused(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function close() {
    if (text || media.length || recorded || state.isRecording)
      Alert.alert(
        "Discard post?",
        "Your draft and attachments will be removed.",
        [
          { text: "Keep editing", style: "cancel" },
          { text: "Discard", style: "destructive", onPress: onClose },
        ],
      );
    else onClose();
  }
  const button = (label: string, onPress: () => void, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[s.button, disabled && { opacity: 0.45 }]}
    >
      <Text style={s.buttonText}>{label}</Text>
    </Pressable>
  );
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.root}
    >
      <View style={s.header}>
        {button("‹", close)}
        <Text style={s.heading}>Create Post</Text>
        {mode !== "choose" &&
          button(
            busy ? "Saving…" : "Post",
            () => {
              setBusy(true);
              setError("");
              void api<FeedPost>("posts", "POST", {
                text,
                communityId: destination,
                attachmentIds: mediaRef.current.map((m) => m.id),
                interests: tags,
              })
                .then((p) => {
                  published.current = true;
                  onPublished(p);
                })
                .catch(() =>
                  setError(
                    "Could not publish. Check your connection and community membership.",
                  ),
                )
                .finally(() => setBusy(false));
            },
            busy ||
              state.isRecording ||
              !!recorded ||
              (!text.trim() && !media.length) ||
              !destination,
          )}
      </View>
      {mode === "choose" ? (
        <>
          <Text style={s.heading}>What do you want to share?</Text>
          {[
            {
              id: "text",
              title: "Text",
              copy: "Share your thoughts",
              icon: "☰",
            },
            {
              id: "image",
              title: "Image",
              copy: "Add photos from your gallery",
              icon: "▧",
            },
            {
              id: "audio",
              title: "Audio",
              copy: "Record a voice post",
              icon: "◖",
            },
          ].map((t) => (
            <Pressable
              key={t.id}
              accessibilityRole="button"
              accessibilityLabel={t.title}
              style={s.type}
              onPress={() => setMode(t.id)}
            >
              <Icon
                name={
                  t.id === "text"
                    ? "comment"
                    : t.id === "image"
                      ? "image"
                      : "audio"
                }
                color="#ff6a00"
                size={30}
              />
              <View>
                <Text style={s.heading}>{t.title}</Text>
                <Text style={s.muted}>{t.copy}</Text>
              </View>
            </Pressable>
          ))}
        </>
      ) : (
        <>
          <TextInput
            accessibilityLabel="Post text"
            multiline
            maxLength={500}
            placeholder="Share what’s on your mind…"
            placeholderTextColor="#888"
            value={text}
            onChangeText={setText}
            editable={!busy}
            style={s.input}
          />
          <Text style={s.counter}>{text.length}/500</Text>
          {media.map((m) => (
            <View key={m.id} style={{ gap: 12 }}>
              <PostAttachment media={m} />
              {button(
                "Remove",
                () => {
                  setBusy(true);
                  void api(`media/${m.id}`, "DELETE")
                    .then(() => {
                      mediaRef.current = mediaRef.current.filter(
                        (x) => x.id !== m.id,
                      );
                      setMedia([...mediaRef.current]);
                    })
                    .catch(() => setError("Could not remove attachment."))
                    .finally(() => setBusy(false));
                },
                busy,
              )}
            </View>
          ))}
          {mode !== "audio" &&
            button("Add image", () => void images(), busy || media.length >= 3)}
          {mode !== "audio" &&
            button(
              "Record audio",
              () => setMode("audio"),
              busy || !!media.length,
            )}
          {mode === "audio" && !media.length && (
            <View style={s.recorder}>
              <View style={s.wave}>
                {Array.from({ length: 25 }, (_, i) => (
                  <View
                    key={i}
                    style={{
                      width: 4,
                      borderRadius: 3,
                      backgroundColor: "#ff6a00",
                      height:
                        8 +
                        Math.sin(i * 2.1) ** 2 *
                          (state.isRecording
                            ? Math.max(10, 60 + (state.metering ?? -30))
                            : 45),
                    }}
                  />
                ))}
              </View>
              <Text style={s.heading}>
                {Math.floor(state.durationMillis / 60000)}:
                {String(Math.floor(state.durationMillis / 1000) % 60).padStart(
                  2,
                  "0",
                )}{" "}
                / 2:00
              </Text>
              {recorded && <LocalAudio uri={recorded} />}
              <View style={s.controls}>
                {state.isRecording || paused ? (
                  <>
                    {button(paused ? "Resume" : "Pause", () => {
                      if (paused) recorder.record();
                      else recorder.pause();
                      setPaused(!paused);
                    })}
                    {button("Stop recording", () => void stop())}
                  </>
                ) : (
                  button(
                    recorded ? "Record again" : "Start recording",
                    () => void start(),
                    busy,
                  )
                )}
                {recorded && (
                  <>
                    {button("Delete recording", () => setRecorded(null), busy)}
                    {button(
                      "Save recording",
                      () => {
                        setBusy(true);
                        void upload(recorded, "audio/mp4")
                          .then(() => setRecorded(null))
                          .catch((e) => setError(e.message))
                          .finally(() => setBusy(false));
                      },
                      busy,
                    )}
                  </>
                )}
              </View>
              <Text style={s.muted}>
                Up to two minutes. Your microphone is used only while recording.
              </Text>
            </View>
          )}
          <Text style={s.heading}>Topics (optional, up to five)</Text>
          <View style={s.controls}>
            {INTERESTS.map((t) => (
              <Pressable
                key={t.id}
                accessibilityRole="button"
                accessibilityState={{ selected: tags.includes(t.id) }}
                disabled={!tags.includes(t.id) && tags.length >= 5}
                onPress={() =>
                  setTags((x) =>
                    x.includes(t.id)
                      ? x.filter((id) => id !== t.id)
                      : [...x, t.id],
                  )
                }
                style={[
                  s.chip,
                  tags.includes(t.id) && { borderColor: "#ff6a00" },
                ]}
              >
                <Text style={s.text}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={s.heading}>Add to community</Text>
          <View style={s.controls}>
            {communities.map((c) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: destination === c.id }}
                key={c.id}
                onPress={() => setDestination(c.id)}
                style={[
                  s.chip,
                  destination === c.id && { borderColor: "#ff6a00" },
                ]}
              >
                <Text style={s.text}>{c.name}</Text>
              </Pressable>
            ))}
          </View>
          {!communities.length && (
            <Text style={s.muted}>Join a community before posting.</Text>
          )}
        </>
      )}
      {error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  root: { padding: 20, gap: 20, backgroundColor: "#0b0b0b", flexGrow: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  heading: { color: "#fff", fontSize: 18, fontWeight: "700" },
  text: { color: "#fff", fontSize: 13 },
  muted: { color: "#a3a3a3", fontSize: 12, lineHeight: 20 },
  button: {
    borderRadius: 22,
    backgroundColor: "#ff6a00",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  buttonText: { color: "#0b0b0b", fontWeight: "700", fontSize: 13 },
  type: {
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    backgroundColor: "#151515",
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
  },
  symbol: { fontSize: 30, color: "#ff6a00" },
  input: {
    height: 180,
    color: "#fff",
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    padding: 16,
    textAlignVertical: "top",
  },
  counter: {
    fontSize: 12,
    color: "#a3a3a3",
    textAlign: "right",
    marginTop: -35,
    marginRight: 14,
  },
  recorder: { gap: 24, alignItems: "center", paddingVertical: 24 },
  wave: { flexDirection: "row", alignItems: "center", gap: 3, height: 80 },
  controls: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: { padding: 12, borderRadius: 20, borderWidth: 1, borderColor: "#333" },
  error: { color: "#ffb08a", padding: 16 },
});
