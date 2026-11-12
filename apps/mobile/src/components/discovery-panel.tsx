import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { View, Text, TextInput, Pressable, Image } from "../theme/primitives";
import type {
  Discovery,
  CommunitySummary,
  CommunityDetail,
} from "@circle/shared-types";
import Avatar from "./avatar";
import { api } from "../lib/session";
import { communityCovers } from "../lib/community-covers";
const s = StyleSheet.create({
  root: { padding: 20, gap: 20, backgroundColor: "#0b0b0b" },
  row: { flexDirection: "row", gap: 12, alignItems: "center" },
  text: { color: "#fff", fontSize: 14 },
  heading: { color: "#fff", fontSize: 20, fontWeight: "700" },
  muted: { color: "#a3a3a3", fontSize: 12, lineHeight: 20 },
  button: { backgroundColor: "#ff6a00", padding: 12, borderRadius: 20 },
  buttonText: { color: "#0b0b0b", fontSize: 12, fontWeight: "700" },
  cover: { width: 50, height: 50, borderRadius: 10 },
  tabs: { flexDirection: "row", gap: 10 },
  tab: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: "#1a1a1a",
    borderRadius: 24,
    alignItems: "center",
  },
  input: {
    color: "#fff",
    backgroundColor: "#1a1a1a",
    padding: 14,
    borderRadius: 12,
  },
  hero: { width: "100%", height: 220 },
  error: { color: "#ffb08a" },
});
export default function DiscoveryPanel({
  query,
  onQuery,
  onTopic,
  onCommunity,
  onChanged,
  onCategory,
}: {
  query: string;
  onQuery: (q: string) => void;
  onTopic: (id: string) => void;
  onCommunity: (c: CommunitySummary) => void;
  onChanged: () => void;
  onCategory?: (tab: string) => void;
}) {
  const [tab, setTab] = useState("trending"),
    [data, setData] = useState<Discovery | null>(null),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      void api<Discovery>("discover?" + new URLSearchParams({ q: query }))
        .then((x) => {
          if (live) setData(x);
        })
        .catch(() => {
          if (live) setError("Discovery could not load.");
        });
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, revision]);
  function change(path: string, active: boolean) {
    setBusy(true);
    setError("");
    void api(path, "PUT", { active })
      .then(() => {
        setRevision((x) => x + 1);
        onChanged();
      })
      .catch(() => setError("Could not save this change."))
      .finally(() => setBusy(false));
  }
  return (
    <View style={s.root}>
      <Text style={s.heading}>Discover</Text>
      <TextInput
        accessibilityLabel="Search posts, people and communities"
        style={s.input}
        value={query}
        onChangeText={onQuery}
        maxLength={80}
        placeholder="Search posts, people, communities…"
        placeholderTextColor="#888"
      />
      <View style={s.tabs}>
        {["trending", "people", "communities"].map((t) => (
          <Pressable
            key={t}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
            onPress={() => {
              setTab(t);
              onCategory?.(t);
            }}
            style={[s.tab, tab === t && { backgroundColor: "#ff6a00" }]}
          >
            <Text style={[s.text, tab === t && { color: "#0b0b0b" }]}>
              {t[0].toUpperCase() + t.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>
      {error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {!data ? (
        <Text style={s.muted}>Finding conversations…</Text>
      ) : (
        <>
          {tab === "trending" && (
            <>
              <Text style={s.heading}>Trending Topics</Text>
              {data.topics.length ? (
                data.topics.map((t) => (
                  <Pressable
                    key={t.id}
                    accessibilityRole="button"
                    style={s.row}
                    onPress={() => onTopic(t.id)}
                  >
                    <Text style={{ fontSize: 28, color: "#ff6a00" }}>#</Text>
                    <View>
                      <Text style={s.text}>#{t.label.replaceAll(" ", "")}</Text>
                      <Text style={s.muted}>{t.posts} posts this week</Text>
                    </View>
                  </Pressable>
                ))
              ) : (
                <Text style={s.muted}>
                  No trending topics yet. Start a conversation.
                </Text>
              )}
              <Text style={s.heading}>Recommended Communities</Text>
            </>
          )}
          {tab === "people"
            ? data.people.map((p) => (
                <View key={p.handle} style={s.row}>
                  <Avatar avatar={p.avatar} seed={p.handle} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.text}>{p.displayName ?? p.handle}</Text>
                    <Text style={s.muted}>@{p.handle}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    style={s.button}
                    onPress={() =>
                      change(`profiles/${p.handle}/follow`, !p.following)
                    }
                  >
                    <Text style={s.buttonText}>
                      {p.following ? "Following" : "Follow"}
                    </Text>
                  </Pressable>
                </View>
              ))
            : data.communities.map((c) => (
                <View key={c.id} style={s.row}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${c.name}`}
                    onPress={() => onCommunity(c)}
                  >
                    <Image source={communityCovers[c.slug]} style={s.cover} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    style={{ flex: 1 }}
                    onPress={() => onCommunity(c)}
                  >
                    <Text style={s.text}>{c.name}</Text>
                    <Text style={s.muted}>{c.memberCount} members</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    style={s.button}
                    onPress={() =>
                      change(`communities/${c.id}/membership`, !c.joined)
                    }
                  >
                    <Text style={s.buttonText}>
                      {c.joined ? "Joined" : "Join"}
                    </Text>
                  </Pressable>
                </View>
              ))}
        </>
      )}
    </View>
  );
}
export function CommunityPanel({
  community,
  tab,
  onTab,
  onBack,
  onChanged,
}: {
  community: CommunitySummary;
  tab: "latest" | "trending" | "about";
  onTab: (t: "latest" | "trending" | "about") => void;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<CommunityDetail | null>(null),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void api<CommunityDetail>(`communities/${community.id}/detail`)
      .then((x) => {
        if (live) setData(x);
      })
      .catch(() => {
        if (live) setError("Community details could not load.");
      });
    return () => {
      live = false;
    };
  }, [community.id, revision]);
  return (
    <View style={{ backgroundColor: "#0b0b0b" }}>
      <Image source={communityCovers[community.slug]} style={s.hero} />
      <View style={s.root}>
        <Pressable accessibilityRole="button" onPress={onBack}>
          <Text style={s.text}>‹ Back to communities</Text>
        </Pressable>
        <View style={s.row}>
          <Image source={communityCovers[community.slug]} style={s.cover} />
          <View style={{ flex: 1 }}>
            <Text style={s.heading}>{community.name}</Text>
            <Text style={s.muted}>
              {data?.memberCount ?? "…"} members · Public
            </Text>
          </View>
        </View>
        <Text style={s.muted}>{community.description}</Text>
        <Pressable
          accessibilityRole="button"
          style={s.button}
          disabled={busy || !data}
          onPress={() => {
            setBusy(true);
            void api(`communities/${community.id}/membership`, "PUT", {
              active: !data?.joined,
            })
              .then(() => {
                setRevision((x) => x + 1);
                onChanged();
              })
              .catch(() =>
                setError(
                  "Could not change membership. Owners must transfer ownership before leaving.",
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          <Text style={[s.buttonText, { textAlign: "center" }]}>
            {data?.joined ? "Joined ✓" : "Join"}
          </Text>
        </Pressable>
        <View style={s.tabs}>
          {(["latest", "trending", "about"] as const).map((t) => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t }}
              key={t}
              style={[s.tab, tab === t && { backgroundColor: "#ff6a00" }]}
              onPress={() => onTab(t)}
            >
              <Text style={[s.text, tab === t && { color: "#0b0b0b" }]}>
                {t[0].toUpperCase() + t.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
        {error && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
        {tab === "about" && (
          <View style={{ gap: 16 }}>
            <Text style={s.heading}>About {community.name}</Text>
            <Text style={s.muted}>{community.description}</Text>
            <Text style={s.muted}>
              {data?.postCount ?? 0} posts · Public community
            </Text>
            <Text style={s.heading}>Keep the circle welcoming.</Text>
            <Text style={s.muted}>
              Respect others, protect personal information, and share your own
              experiences.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
