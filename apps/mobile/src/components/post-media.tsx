import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { Image, View, Text, Pressable } from "../theme/primitives";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import type { PostMedia } from "@circle/shared-types";
import { authenticatedMediaSource } from "../lib/session";
function Audio({
  source,
}: {
  source: { uri: string; headers?: Record<string, string> };
}) {
  const player = useAudioPlayer(source),
    status = useAudioPlayerStatus(player);
  return (
    <View style={styles.audio}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          status.playing ? "Pause voice post" : "Play voice post"
        }
        onPress={() => {
          if (status.playing) player.pause();
          else {
            if (status.didJustFinish) void player.seekTo(0);
            player.play();
          }
        }}
      >
        <Text style={styles.play}>{status.playing ? "Ⅱ" : "▶"}</Text>
      </Pressable>
      <Text style={styles.text}>
        Voice post · {Math.floor(status.currentTime ?? 0)} /{" "}
        {Math.ceil(status.duration ?? 0)}s
      </Text>
      {status.isBuffering && <Text style={styles.text}>Loading…</Text>}
    </View>
  );
}
export function LocalAudio({ uri }: { uri: string }) {
  return <Audio source={{ uri }} />;
}
export default function PostAttachment({ media }: { media: PostMedia }) {
  const [source, setSource] = useState<{
    uri: string;
    headers: Record<string, string>;
  } | null>(null);
  useEffect(() => {
    let live = true;
    void authenticatedMediaSource(media.url).then((x) => {
      if (live) setSource(x);
    });
    return () => {
      live = false;
    };
  }, [media.url]);
  if (!source) return <Text>Loading media…</Text>;
  return media.kind === "IMAGE" ? (
    <Image
      source={source}
      accessibilityLabel="Photo shared with this post"
      style={styles.image}
    />
  ) : (
    <Audio source={source} />
  );
}
const styles = StyleSheet.create({
  image: {
    width: "100%",
    aspectRatio: 1.4,
    borderRadius: 16,
    marginVertical: 12,
  },
  audio: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#21170f",
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    marginVertical: 12,
  },
  play: { fontSize: 24, color: "#ff6a00" },
  text: { color: "#fff", fontSize: 12 },
});
