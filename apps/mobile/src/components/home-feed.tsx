import { useAppTheme } from "../theme/store";
import Avatar from "./avatar";
import { useEffect, useRef, useState, type ElementRef } from "react";
import {
  FlatList,
  type TextProps,
  StyleSheet,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Share,
  ActivityIndicator,
} from "react-native";
import {
  ScrollView,
  View,
  Text as NativeText,
  Pressable,
  Image,
  TextInput,
  Modal,
} from "../theme/primitives";
import { SafeAreaView } from "../theme/primitives";
import { Stack } from "expo-router";
import type {
  HomeFeed as Feed,
  FeedPost,
  FeedComment,
  FeedActivity,
  UserProfile,
  CommunitySummary,
  Page,
} from "@circle/shared-types";
import { ONBOARDING_BACKGROUNDS } from "@circle/constants";
import { brand, themes, type FeedIconName } from "@circle/design-tokens";
import { backgroundSources } from "../lib/onboarding";
import { api, webUrl } from "../lib/session";
import { Wordmark, BrandMark } from "./brand";
import Icon from "./feed-icons";
import PostComposer from "./post-composer";
import PostAttachment from "./post-media";
import DiscoveryPanel, { CommunityPanel } from "./discovery-panel";
import { communityCovers } from "../lib/community-covers";
const age = (date: string) => {
  const m = Math.max(
    0,
    Math.floor((Date.now() - new Date(date).getTime()) / 60000),
  );
  return m < 1
    ? "Just now"
    : m < 60
      ? `${m}m ago`
      : m < 1440
        ? `${Math.floor(m / 60)}h ago`
        : new Date(date).toLocaleDateString();
};
function Text({ style, ...props }: TextProps) {
  return <NativeText {...props} style={[{ fontFamily: "Inter" }, style]} />;
}
export default function HomeFeed({
  profile,
  onProfile,
}: {
  profile: UserProfile;
  onProfile: () => void;
}) {
  const customTheme = useAppTheme();
  const system = useColorScheme(),
    dark =
      profile.profileTheme === "DARK" ||
      (profile.profileTheme === "SYSTEM" && system === "dark"),
    p = dark ? themes.dark : themes.light,
    orange = dark ? brand.orange : "#9D4200";
  const [feed, setFeed] = useState<Feed | null>(null),
    [screen, setScreen] = useState<
      "feed" | "discover" | "communities" | "saved"
    >("feed"),
    [tab, setTab] = useState<"for-you" | "following" | "trending">("for-you"),
    [community, setCommunity] = useState<CommunitySummary | null>(null),
    [query, setQuery] = useState(""),
    [topic, setTopic] = useState(""),
    [catalog, setCatalog] = useState<CommunitySummary[]>([]),
    [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [pending, setPending] = useState<string[]>([]);
  const [modal, setModal] = useState<"compose" | "post" | "activity" | null>(
      null,
    ),
    [selected, setSelected] = useState<FeedPost | null>(null),
    [comments, setComments] = useState<FeedComment[]>([]),
    [commentText, setCommentText] = useState(""),
    [activity, setActivity] = useState<{
      items: FeedActivity[];
      unreadCount: number;
    }>({ items: [], unreadCount: 0 }),
    [removed, setRemoved] = useState<string | null>(null);
  const [discoveryTab, setDiscoveryTab] = useState("trending");
  const [communityTab, setCommunityTab] = useState<
    "latest" | "trending" | "about"
  >("latest");
  const commentInput = useRef<ElementRef<typeof TextInput>>(null);
  useEffect(() => {
    let live = true;
    void api<Page<CommunitySummary>>("communities")
      .then((x) => {
        if (live) setCatalog(x.items);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    void api<typeof activity>("activity")
      .then((x) => {
        if (live) setActivity(x);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(
      () => {
        setLoading(true);
        setError("");
        const params = new URLSearchParams({
          tab:
            screen === "saved"
              ? "saved"
              : screen === "discover"
                ? "discover"
                : tab,
        });
        if (screen === "discover" && query.trim())
          params.set("q", query.trim());
        if (screen === "discover" && topic) params.set("topic", topic);
        if (screen === "feed" && community)
          params.set("communityId", community.id);
        void api<Feed>("feed?" + params)
          .then((x) => {
            if (live) setFeed(x);
          })
          .catch((e) => {
            if (live) setError(e.message);
          })
          .finally(() => {
            if (live) setLoading(false);
          });
      },
      query ? 250 : 0,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [screen, tab, query, topic, community, revision]);
  async function action(key: string, task: () => Promise<void>) {
    if (pending.includes(key)) return;
    setPending((x) => [...x, key]);
    setError("");
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending((x) => x.filter((k) => k !== key));
    }
  }
  const button = (
    label: string,
    fn: () => void,
    primary = false,
    disabled = false,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={fn}
      style={[
        s.button,
        {
          backgroundColor: primary ? brand.orange : p.surface,
          borderColor: primary ? brand.orange : p.border,
        },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Text
        style={{
          color: primary ? brand.black : p.text,
          fontWeight: "600",
          fontSize: 12,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
  const iconButton = (
    name: FeedIconName,
    label: string,
    fn: () => void,
    active = false,
    disabled = false,
    count?: number,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={fn}
      style={[s.iconButton, disabled && { opacity: 0.4 }]}
    >
      <Icon
        name={name}
        color={active ? orange : p.muted}
        filled={active}
        size={22}
      />
      {count !== undefined && (
        <Text style={{ color: active ? orange : p.muted, fontSize: 10 }}>
          {count}
        </Text>
      )}
    </Pressable>
  );
  function patch(post: FeedPost) {
    setFeed((f) =>
      f
        ? { ...f, items: f.items.map((x) => (x.id === post.id ? post : x)) }
        : f,
    );
    setSelected((x) => (x?.id === post.id ? post : x));
  }
  function react(post: FeedPost, kind: "like" | "save" | "repost") {
    void action(post.id, async () => {
      const active = !(kind === "like"
        ? post.liked
        : kind === "save"
          ? post.saved
          : post.reposted);
      patch(await api<FeedPost>(`posts/${post.id}/${kind}`, "PUT", { active }));
      if (screen === "saved" && !active && kind === "save")
        setRevision((x) => x + 1);
    });
  }
  async function openPost(post: FeedPost | string) {
    const id = typeof post === "string" ? post : post.id;
    await action("thread", async () => {
      const [fresh, replies] = await Promise.all([
        api<FeedPost>("posts/" + id),
        api<FeedComment[]>(`posts/${id}/comments`),
      ]);
      setSelected(fresh);
      setComments(replies);
      setCommentText("");
      setModal("post");
    });
  }
  function selectCommunity(c: CommunitySummary) {
    setCommunity(c);
    setCommunityTab("latest");
    setTab("for-you");
    setScreen("feed");
    setModal(null);
  }
  async function share(post: FeedPost) {
    try {
      await Share.share({
        message: `A conversation on Circle.social\n${webUrl}/#post-${post.id}`,
      });
    } catch {
      setError("This post could not be shared.");
    }
  }
  function follow(post: FeedPost) {
    void action(post.id, async () => {
      await api(`profiles/${post.author.handle}/follow`, "PUT", {
        active: !post.following,
      });
      setFeed((f) =>
        f
          ? {
              ...f,
              items: f.items.map((x) =>
                x.author.handle === post.author.handle
                  ? { ...x, following: !post.following }
                  : x,
              ),
            }
          : f,
      );
      if (tab === "following") setRevision((x) => x + 1);
      setNotice(
        post.following
          ? `Unfollowed @${post.author.handle}`
          : `Following @${post.author.handle}`,
      );
    });
  }
  function options(post: FeedPost) {
    Alert.alert("Post", `@${post.author.handle}`, [
      ...(post.author.handle !== profile.handle
        ? [
            {
              text: post.following ? "Unfollow" : "Follow",
              onPress: () => follow(post),
            },
          ]
        : []),
      { text: "Share", onPress: () => void share(post) },
      ...(post.author.handle === profile.handle
        ? [
            {
              text: "Remove post",
              style: "destructive" as const,
              onPress: () =>
                Alert.alert(
                  "Remove post?",
                  "You can undo this until you leave or refresh the page.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Remove",
                      style: "destructive",
                      onPress: () =>
                        void action("remove", async () => {
                          await api("posts/" + post.id, "DELETE");
                          setRemoved(post.id);
                          setModal(null);
                          setRevision((x) => x + 1);
                        }),
                    },
                  ],
                ),
            },
          ]
        : []),
      { text: "Cancel", style: "cancel" },
    ]);
  }
  function compose() {
    setModal("compose");
  }
  function postCard(post: FeedPost) {
    return (
      <View style={[s.post, { borderColor: p.border }]}>
        <View style={s.postHeader}>
          <View
            style={[
              s.avatar,
              { borderColor: orange, backgroundColor: p.surface },
            ]}
          >
            <Avatar
              avatar={post.author.avatar}
              seed={post.author.handle}
              size={36}
            />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[s.author, { color: p.text }]}>
              {post.author.displayName || post.author.handle}
            </Text>
            <Text style={[s.time, { color: p.muted }]}>
              @{post.author.handle} · {age(post.createdAt)}
            </Text>
          </View>
          {iconButton("more", "Post options", () => options(post))}
        </View>
        <Text style={[s.postText, { color: p.text }]}>{post.text}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => selectCommunity(post.community)}
        >
          <Text style={[s.communityLabel, { color: p.muted }]}>
            {post.community.name}
          </Text>
        </Pressable>
        {!!post.mediaUrls?.length && (
          <View style={s.media}>
            {post.mediaUrls.map((url, i) => {
              const source = ONBOARDING_BACKGROUNDS.find((x) => x.path === url);
              return source ? (
                <Image
                  accessible
                  accessibilityLabel={`${source.label} cover`}
                  key={`${url}-${i}`}
                  source={backgroundSources[source.id]}
                  style={[
                    s.photo,
                    post.mediaUrls.length > 1 && { width: "49%", height: 150 },
                  ]}
                />
              ) : null;
            })}
          </View>
        )}
        {post.attachments?.map((m) => (
          <PostAttachment key={m.id} media={m} />
        ))}
        <View style={s.actions}>
          {iconButton(
            "heart",
            post.liked ? "Unlike post" : "Like post",
            () => react(post, "like"),
            post.liked,
            pending.includes(post.id),
            post.counts?.likes ?? 0,
          )}
          {iconButton(
            "comment",
            "Comments",
            () =>
              modal === "post"
                ? commentInput.current?.focus()
                : void openPost(post),
            false,
            false,
            post.counts?.comments ?? 0,
          )}
          {iconButton(
            "repeat",
            post.reposted ? "Undo repost" : "Repost",
            () => react(post, "repost"),
            post.reposted,
            pending.includes(post.id),
            post.counts?.reposts ?? 0,
          )}
          {iconButton("share", "Share post", () => void share(post))}
          <View style={{ flex: 1 }} />
          {iconButton(
            "bookmark",
            post.saved ? "Unsave post" : "Save post",
            () => react(post, "save"),
            post.saved,
            pending.includes(post.id),
          )}
        </View>
      </View>
    );
  }
  async function notifications() {
    setModal("activity");
    await action("activity", async () => {
      const result = await api<typeof activity>("activity");
      setActivity(result);
      if (result.items.some((x) => !x.readAt))
        setActivity(
          await api<typeof activity>("activity/read", "POST", {
            ids: result.items.map((x) => x.id),
          }),
        );
    });
  }
  const members = new Set(feed?.communities.map((c) => c.id) ?? []);
  return (
    <SafeAreaView style={[s.root, { backgroundColor: p.background }]}>
      <Stack.Screen
        options={{
          statusBarStyle: (
            customTheme ? customTheme.appearance === "dark" : dark
          )
            ? "light"
            : "dark",
        }}
      />
      <View style={s.header}>
        <Wordmark color={p.text} />
        <View style={{ flexDirection: "row" }}>
          {iconButton("search", "Search Circle.social", () => {
            setDiscoveryTab("trending");
            setScreen("discover");
          })}
          <View>
            {iconButton(
              "bell",
              `Notifications${activity.unreadCount ? ", " + activity.unreadCount + " unread" : ""}`,
              () => void notifications(),
            )}
            {activity.unreadCount > 0 && (
              <View style={s.badge}>
                <Text style={{ fontSize: 9, color: brand.black }}>
                  {activity.unreadCount > 9 ? "9+" : activity.unreadCount}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
      {screen === "feed" && !community && (
        <View style={s.tabs}>
          {(
            [
              { id: "for-you", label: "For You" },
              { id: "following", label: "Following" },
              { id: "trending", label: "Trending" },
            ] as const
          ).map((t) => (
            <Pressable
              key={t.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t.id }}
              onPress={() => {
                setTab(t.id);
                setCommunity(null);
              }}
              style={[
                s.tab,
                { backgroundColor: tab === t.id ? brand.orange : p.surface },
              ]}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: tab === t.id ? brand.black : p.muted,
                }}
              >
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {!!error && (
        <Text
          accessibilityRole="alert"
          style={[
            s.message,
            {
              color: p.text,
              borderColor: p.border,
              backgroundColor: p.surface,
            },
          ]}
        >
          {error}
        </Text>
      )}
      {!!notice && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss message"
          onPress={() => setNotice("")}
        >
          <Text
            accessibilityRole="alert"
            style={[s.message, { color: orange, borderColor: p.border }]}
          >
            {notice}
          </Text>
        </Pressable>
      )}
      {removed && (
        <View style={[s.undo, { backgroundColor: p.surface }]}>
          <Text style={{ color: p.text }}>Post removed.</Text>
          {button(
            "Undo",
            () =>
              void action("restore", async () => {
                await api(`posts/${removed}/restore`, "POST", {});
                setRemoved(null);
                setRevision((x) => x + 1);
              }),
          )}
        </View>
      )}
      {screen === "communities" ? (
        <ScrollView contentContainerStyle={s.section}>
          <Text style={[s.title, { color: p.text }]}>Find your people.</Text>
          <Text style={[s.copy, { color: p.muted }]}>
            One identity. Five communities.
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "space-between",
              rowGap: 14,
            }}
          >
            {catalog.map((c) => (
              <View
                key={c.id}
                style={[s.communityCard, { borderColor: p.border }]}
              >
                {communityCovers[c.slug] && (
                  <Image
                    source={communityCovers[c.slug]}
                    accessibilityIgnoresInvertColors
                    style={{ width: "100%", aspectRatio: 1, borderRadius: 12 }}
                  />
                )}
                <View style={{ flex: 1 }}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => selectCommunity(c)}
                  >
                    <Text style={[s.heading, { color: p.text }]}>{c.name}</Text>
                  </Pressable>
                  <Text style={[s.copy, { color: p.muted }]}>
                    {c.description}
                  </Text>
                </View>
                {button(
                  members.has(c.id) ? "Joined ✓" : "Join",
                  () =>
                    void action(c.id, async () => {
                      await api(`communities/${c.id}/membership`, "PUT", {
                        active: !members.has(c.id),
                      });
                      setRevision((x) => x + 1);
                    }),
                  !members.has(c.id),
                  pending.includes(c.id),
                )}
              </View>
            ))}
          </View>
        </ScrollView>
      ) : (
        <FlatList
          style={
            customTheme
              ? { backgroundColor: customTheme.colors.secondaryBackground }
              : undefined
          }
          data={
            loading ||
            (screen === "discover" && discoveryTab !== "trending") ||
            (community && screen === "feed" && communityTab === "about")
              ? []
              : (feed?.items ?? [])
          }
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => postCard(item)}
          refreshing={loading}
          onRefresh={() => setRevision((x) => x + 1)}
          contentContainerStyle={{ paddingBottom: 100, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <>
              {screen === "discover" && (
                <DiscoveryPanel
                  onCategory={setDiscoveryTab}
                  query={query}
                  onQuery={setQuery}
                  onTopic={(id) => setTopic(id)}
                  onCommunity={selectCommunity}
                  onChanged={() => setRevision((x) => x + 1)}
                />
              )}
              {community && screen === "feed" && (
                <CommunityPanel
                  key={community.id}
                  community={community}
                  tab={communityTab}
                  onTab={(t) => {
                    setCommunityTab(t);
                    setTab(t === "trending" ? "trending" : "for-you");
                  }}
                  onBack={() => {
                    setCommunity(null);
                    setScreen("communities");
                  }}
                  onChanged={() => setRevision((x) => x + 1)}
                />
              )}
              {screen === "discover" &&
                topic &&
                button("Clear topic filter ×", () => setTopic(""))}
              {screen === "saved" && (
                <Text style={[s.title, { color: p.text, padding: 20 }]}>
                  Saved posts
                </Text>
              )}
              {community &&
                screen === "feed" &&
                button(community.name + " ×", () => setCommunity(null))}
            </>
          }
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator color={orange} style={{ marginTop: 50 }} />
            ) : screen === "discover" &&
              discoveryTab !== "trending" ? undefined : community &&
              screen === "feed" &&
              communityTab === "about" ? undefined : !error ? (
              <View style={s.empty}>
                <BrandMark size={72} />
                <Text style={[s.emptyTitle, { color: p.text }]}>
                  {screen === "saved"
                    ? "Keep a little inspiration."
                    : screen === "discover"
                      ? "Find your next conversation."
                      : tab === "following"
                        ? "Find the voices you connect with."
                        : "Your circle starts here."}
                </Text>
                <Text style={[s.copy, { color: p.muted, textAlign: "center" }]}>
                  {screen === "saved"
                    ? "Save a post with its bookmark to find it here."
                    : tab === "following"
                      ? "Follow people from their post menu to see them here."
                      : "Share a thought, story or little win with your community."}
                </Text>
                {button(
                  tab === "following"
                    ? "Discover people"
                    : "Start a conversation",
                  tab === "following" ? () => setScreen("discover") : compose,
                  true,
                )}
                {button("Explore communities", () => setScreen("communities"))}
              </View>
            ) : undefined
          }
          ListFooterComponent={
            <View style={s.listFooter}>
              {button("Saved", () => setScreen("saved"))}
              {iconButton("refresh", "Refresh feed", () =>
                setRevision((x) => x + 1),
              )}
            </View>
          }
        />
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create post"
        onPress={compose}
        style={s.fab}
      >
        <Icon name="plus" color={brand.black} size={30} />
      </Pressable>
      <View
        nativeID="theme-navigation"
        style={[
          s.navigation,
          {
            borderColor: customTheme?.colors.border ?? p.border,
            backgroundColor:
              customTheme?.colors.navigationBackground ?? p.background,
          },
        ]}
      >
        {(
          [
            { id: "feed", label: "Feed", icon: "home" },
            { id: "discover", label: "Discover", icon: "search" },
            { id: "communities", label: "Communities", icon: "people" },
            { id: "profile", label: "Profile", icon: "person" },
          ] as const
        ).map((n) => (
          <Pressable
            key={n.id}
            accessibilityRole="button"
            accessibilityLabel={n.id === "profile" ? "Your profile" : n.label}
            accessibilityState={{
              selected:
                n.id === screen || (n.id === "feed" && screen === "saved"),
            }}
            onPress={() => {
              if (n.id === "profile") onProfile();
              else {
                setDiscoveryTab("trending");
                setScreen(n.id);
                setQuery("");
                setTopic("");
              }
            }}
            style={s.navItem}
          >
            <Icon
              name={n.icon}
              filled={
                n.id === "feed" && (screen === "feed" || screen === "saved")
              }
              color={
                n.id === screen || (n.id === "feed" && screen === "saved")
                  ? orange
                  : p.muted
              }
            />
            <Text
              style={{
                fontSize: 10,
                color:
                  n.id === screen || (n.id === "feed" && screen === "saved")
                    ? orange
                    : p.muted,
              }}
            >
              {n.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Modal
        visible={modal !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModal(null)}
      >
        <SafeAreaView style={[s.root, { backgroundColor: p.background }]}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            {modal !== "compose" && (
              <View style={[s.modalHeader, { borderColor: p.border }]}>
                <Text style={[s.heading, { color: p.text }]}>
                  {modal === "activity" ? "Notifications" : "Post"}
                </Text>
                {iconButton("close", "Close dialog", () => setModal(null))}
              </View>
            )}
            {modal === "compose" ? (
              <PostComposer
                communities={feed?.communities ?? []}
                initialCommunity={
                  feed?.communities.find((c) => c.id === community?.id)?.id
                }
                onClose={() => setModal(null)}
                onPublished={(post) => {
                  setModal(null);
                  setScreen("feed");
                  setTab("for-you");
                  setCommunity(post.community);
                  setCommunityTab("latest");
                  setRevision((x) => x + 1);
                  setNotice("Your post is live.");
                }}
              />
            ) : modal === "activity" ? (
              <ScrollView contentContainerStyle={s.section}>
                {pending.includes("activity") ? (
                  <ActivityIndicator color={orange} />
                ) : activity.items.length ? (
                  activity.items.map((item) => (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      disabled={!item.postId}
                      onPress={() => {
                        if (item.postId) void openPost(item.postId);
                      }}
                      style={[s.activity, { borderColor: p.border }]}
                    >
                      <View style={[s.avatar, { borderColor: orange }]}>
                        <Avatar
                          avatar={item.actor.avatar}
                          seed={item.actor.handle}
                          size={36}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.copy, { color: p.text }]}>
                          @{item.actor.handle}{" "}
                          {(
                            {
                              LIKE: "liked your post",
                              COMMENT: "commented on your post",
                              REPOST: "reposted your post",
                              FOLLOW: "started following you",
                            } as Record<string, string>
                          )[item.kind] ?? "joined the conversation"}
                        </Text>
                        <Text style={[s.time, { color: p.muted }]}>
                          {age(item.createdAt)}
                        </Text>
                      </View>
                    </Pressable>
                  ))
                ) : (
                  <View style={s.empty}>
                    <Icon name="bell" color={orange} size={40} />
                    <Text style={[s.heading, { color: p.text }]}>
                      Your conversations, all here.
                    </Text>
                    <Text style={[s.copy, { color: p.muted }]}>
                      Likes, comments, reposts and followers will appear here.
                    </Text>
                  </View>
                )}
                {!!error && (
                  <Text accessibilityRole="alert" style={{ color: p.text }}>
                    {error}
                  </Text>
                )}
              </ScrollView>
            ) : selected ? (
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 35 }}
              >
                {postCard(selected)}
                <View style={s.section}>
                  <Text style={[s.heading, { color: p.text }]}>
                    Comments ({selected.counts.comments})
                  </Text>
                  {comments.length ? (
                    comments.map((c) => (
                      <View key={c.id} style={s.comment}>
                        <View
                          style={[
                            s.avatar,
                            s.smallAvatar,
                            { borderColor: p.border },
                          ]}
                        >
                          <Avatar
                            avatar={c.author.avatar}
                            seed={c.author.handle}
                            size={28}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.author, { color: p.text }]}>
                            @{c.author.handle}
                          </Text>
                          <Text style={[s.time, { color: p.muted }]}>
                            {age(c.createdAt)}
                          </Text>
                          <Text
                            style={[s.copy, { color: p.text, marginTop: 8 }]}
                          >
                            {c.text}
                          </Text>
                        </View>
                      </View>
                    ))
                  ) : (
                    <Text style={[s.copy, { color: p.muted }]}>
                      Be the first to join the conversation.
                    </Text>
                  )}
                  <TextInput
                    ref={commentInput}
                    accessibilityLabel="Your comment"
                    placeholder="Add a comment…"
                    placeholderTextColor={p.muted}
                    maxLength={500}
                    value={commentText}
                    onChangeText={setCommentText}
                    editable={!pending.includes("comment")}
                    style={[
                      s.input,
                      {
                        color: p.text,
                        backgroundColor: p.surface,
                        borderColor: p.border,
                      },
                    ]}
                  />
                  {button(
                    "Send",
                    () =>
                      void action("comment", async () => {
                        const result = await api<{
                          post: FeedPost;
                          comments: FeedComment[];
                        }>(`posts/${selected.id}/comments`, "POST", {
                          text: commentText,
                        });
                        patch(result.post);
                        setComments(result.comments);
                        setCommentText("");
                      }),
                    true,
                    !commentText.trim() || pending.includes("comment"),
                  )}
                  {!!error && (
                    <Text accessibilityRole="alert" style={{ color: p.text }}>
                      {error}
                    </Text>
                  )}
                </View>
              </ScrollView>
            ) : null}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tabs: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  tab: { flex: 1, paddingVertical: 13, borderRadius: 28, alignItems: "center" },
  post: { padding: 20, paddingBottom: 10, borderBottomWidth: 1 },
  postHeader: { flexDirection: "row", gap: 11, alignItems: "center" },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  emoji: { fontSize: 26 },
  author: { fontSize: 12, fontWeight: "600" },
  time: { fontSize: 10, lineHeight: 16 },
  postText: { fontSize: 14, lineHeight: 23, marginTop: 16, marginBottom: 5 },
  communityLabel: { fontSize: 10, paddingVertical: 8 },
  media: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    borderRadius: 14,
    overflow: "hidden",
  },
  photo: { width: "100%", height: 225, resizeMode: "cover" },
  actions: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 6,
    alignItems: "center",
  },
  iconButton: {
    minWidth: 35,
    minHeight: 40,
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  navigation: {
    flexDirection: "row",
    borderTopWidth: 1,
    paddingTop: 8,
    paddingBottom: 6,
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minHeight: 48,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 95,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: brand.orange,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: brand.orange,
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  badge: {
    position: "absolute",
    right: 0,
    top: 0,
    width: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: brand.orange,
    alignItems: "center",
    justifyContent: "center",
  },
  section: { padding: 22, gap: 18 },
  title: { fontFamily: "Chillax", fontSize: 28 },
  heading: { fontFamily: "Chillax", fontSize: 19, lineHeight: 27 },
  copy: { fontSize: 12, lineHeight: 21 },
  label: { fontSize: 12, fontWeight: "600", marginTop: 8 },
  button: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 42,
    paddingVertical: 11,
    paddingHorizontal: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontFamily: "Inter",
    fontSize: 13,
  },
  textarea: { minHeight: 180, textAlignVertical: "top" },
  communityCard: {
    width: "48%",
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 10,
    alignItems: "stretch",
  },
  empty: {
    alignItems: "center",
    paddingHorizontal: 30,
    paddingTop: 55,
    paddingBottom: 45,
    gap: 20,
  },
  emptyTitle: {
    fontFamily: "Chillax",
    fontSize: 25,
    textAlign: "center",
    lineHeight: 34,
  },
  listFooter: {
    flexDirection: "row",
    gap: 20,
    padding: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  coverGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cover: {
    width: "30%",
    height: 94,
    borderRadius: 12,
    borderWidth: 2,
    overflow: "hidden",
  },
  coverCheck: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: brand.orange,
    borderRadius: 20,
    padding: 2,
  },
  comment: { flexDirection: "row", gap: 12, paddingVertical: 12 },
  smallAvatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 1 },
  activity: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    paddingVertical: 20,
    borderBottomWidth: 1,
  },
  message: {
    fontSize: 12,
    lineHeight: 20,
    padding: 14,
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  undo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    gap: 20,
  },
});
