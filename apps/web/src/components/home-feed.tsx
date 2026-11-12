"use client";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import Image from "next/image";
import type {
  HomeFeed as Feed,
  UserProfile,
  FeedPost,
  FeedComment,
  FeedActivity,
  CommunitySummary,
  Page,
} from "@circle/shared-types";
import { COMMUNITY_COVERS, ONBOARDING_BACKGROUNDS } from "@circle/constants";
import { api } from "./identity-panel";
import { BrandMark, Wordmark } from "./brand";
import Icon from "./feed-icons";
import Avatar from "./avatar";
import PostComposer from "./post-composer";
import DiscoveryPanel from "./discovery-panel";
import CommunityDetail from "./community-detail";
type Screen = "feed" | "discover" | "communities" | "saved";
type Tab = "for-you" | "following" | "trending";
function timeAgo(value: string) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60000),
  );
  return minutes < 1
    ? "Just now"
    : minutes < 60
      ? `${minutes}m ago`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}h ago`
        : new Date(value).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          });
}
function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.showModal();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="feed-dialog"
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button
          className="feed-icon-button"
          aria-label={`Close ${title}`}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function PostCard({
  post,
  profile,
  busy,
  onReact,
  onComments,
  onShare,
  onFollow,
  onRemove,
  onCommunity,
}: {
  post: FeedPost;
  profile: UserProfile;
  busy: boolean;
  onReact: (p: FeedPost, kind: "like" | "save" | "repost") => void;
  onComments: (p: FeedPost) => void;
  onShare: (p: FeedPost) => void;
  onFollow: (p: FeedPost) => void;
  onRemove: (p: FeedPost) => void;
  onCommunity: (c: CommunitySummary) => void;
}) {
  const [menu, setMenu] = useState(false);
  const menuRoot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => {
      if (!menuRoot.current?.contains(event.target as Node)) setMenu(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu]);
  return (
    <article
      className="feed-post"
      aria-label={`Post by @${post.author.handle}`}
    >
      <header className="feed-post-header">
        <div className="feed-avatar" aria-hidden="true">
          <Avatar
            avatar={post.author.avatar}
            seed={post.author.handle}
            size={36}
          />
        </div>
        <div className="feed-post-author">
          <strong>{post.author.displayName || post.author.handle}</strong>
          <span>
            @{post.author.handle} ·{" "}
            <time dateTime={post.createdAt}>{timeAgo(post.createdAt)}</time>
          </span>
        </div>
        <div className="feed-menu" ref={menuRoot}>
          <button
            className="feed-icon-button"
            aria-label={`More options for post by @${post.author.handle}`}
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <Icon name="more" />
          </button>
          {menu && (
            <div
              className="feed-menu-popover"
              role="menu"
              onKeyDown={(e) => {
                if (e.key === "Escape") setMenu(false);
              }}
            >
              {post.author.handle !== profile.handle && (
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    onFollow(post);
                  }}
                >
                  {post.following ? "Unfollow" : "Follow"} @{post.author.handle}
                </button>
              )}
              <button
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  onShare(post);
                }}
              >
                Share post
              </button>
              {post.author.handle === profile.handle && (
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    onRemove(post);
                  }}
                >
                  Remove post
                </button>
              )}
            </div>
          )}
        </div>
      </header>
      <p className="feed-post-text">{post.text}</p>
      <button
        className="feed-community-label"
        onClick={() => onCommunity(post.community)}
      >
        {post.community.name}
      </button>
      {post.mediaUrls.length > 0 && (
        <div className={`feed-media feed-media-${post.mediaUrls.length}`}>
          {post.mediaUrls.map((url, i) => (
            <Image
              key={`${url}-${i}`}
              src={url}
              alt={`${ONBOARDING_BACKGROUNDS.find((x) => x.path === url)?.label ?? "Selected"} cover`}
              width={800}
              height={520}
              sizes="(max-width:760px) 100vw, 640px"
            />
          ))}
        </div>
      )}
      {post.attachments?.map((m) =>
        m.kind === "IMAGE" ? (
          <div className="feed-media feed-media-1" key={m.id}>
            {/* Authenticated media must bypass the public image optimizer. */}

            <Image
              unoptimized
              width={1600}
              height={1200}
              src={`/api${m.url}`}
              alt="Photo shared with this post"
              loading="lazy"
            />
          </div>
        ) : (
          <div className="feed-post-audio" key={m.id}>
            <audio
              controls
              preload="metadata"
              src={`/api${m.url}`}
              aria-label={`Voice post by @${post.author.handle}`}
            />
          </div>
        ),
      )}
      <footer className="feed-post-actions">
        <button
          disabled={busy}
          aria-label={`${post.liked ? "Unlike" : "Like"} post by @${post.author.handle}`}
          aria-pressed={post.liked}
          onClick={() => onReact(post, "like")}
        >
          <Icon name="heart" filled={post.liked} />
          <span>{post.counts.likes}</span>
        </button>
        <button
          onClick={() => onComments(post)}
          aria-label={`Comments on post by @${post.author.handle}`}
        >
          <Icon name="comment" />
          <span>{post.counts.comments}</span>
        </button>
        <button
          disabled={busy}
          aria-label={`${post.reposted ? "Undo repost" : "Repost"} by @${post.author.handle}`}
          aria-pressed={post.reposted}
          onClick={() => onReact(post, "repost")}
        >
          <Icon name="repeat" />
          <span>{post.counts.reposts}</span>
        </button>
        <button
          onClick={() => onShare(post)}
          aria-label={`Share post by @${post.author.handle}`}
        >
          <Icon name="share" />
        </button>
        <button
          disabled={busy}
          className="feed-save"
          aria-label={`${post.saved ? "Unsave" : "Save"} post by @${post.author.handle}`}
          aria-pressed={post.saved}
          onClick={() => onReact(post, "save")}
        >
          <Icon name="bookmark" filled={post.saved} />
        </button>
      </footer>
    </article>
  );
}
export default function HomeFeed({
  profile,
  onProfile,
  onSignOut,
  onReturnToApp,
  onAccessDenied,
}: {
  profile: UserProfile;
  onProfile: () => void;
  onSignOut: () => void;
  onReturnToApp?: () => void;
  onAccessDenied?: () => void;
}) {
  const [feed, setFeed] = useState<Feed | null>(null),
    [screen, setScreen] = useState<Screen>("feed"),
    [tab, setTab] = useState<Tab>("for-you"),
    [query, setQuery] = useState(""),
    [community, setCommunity] = useState<CommunitySummary | null>(null),
    [topic, setTopic] = useState(""),
    [catalog, setCatalog] = useState<CommunitySummary[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [revision, setRevision] = useState(0),
    [pending, setPending] = useState<string[]>([]);
  const [discoveryTab, setDiscoveryTab] = useState("trending");
  const [compose, setCompose] = useState(false);
  const [communityTab, setCommunityTab] = useState<
    "latest" | "trending" | "about"
  >("latest");
  const [selected, setSelected] = useState<FeedPost | null>(null),
    [comments, setComments] = useState<FeedComment[]>([]),
    [commentText, setCommentText] = useState(""),
    [commentsLoading, setCommentsLoading] = useState(false);
  const [activity, setActivity] = useState<{
      items: FeedActivity[];
      unreadCount: number;
    }>({ items: [], unreadCount: 0 }),
    [activityOpen, setActivityOpen] = useState(false),
    [removePost, setRemovePost] = useState<FeedPost | null>(null),
    [removed, setRemoved] = useState<string | null>(null);
  const accessChecked = useRef(false);
  const accessHandler = useRef(onAccessDenied);
  useEffect(() => {
    accessHandler.current = onAccessDenied;
  }, [onAccessDenied]);
  function checkAccess(error: unknown, includeIncomplete = false) {
    const status = (error as { status?: number }).status;
    if (
      !accessChecked.current &&
      (status === 401 || (includeIncomplete && status === 403))
    ) {
      accessChecked.current = true;
      accessHandler.current?.();
    }
  }
  const palette = profile.profileTheme.toLowerCase();
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
      .catch((e) => {
        if (live) checkAccess(e);
      });
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
        if (community && screen === "feed")
          params.set("communityId", community.id);
        if (topic && screen === "discover") params.set("topic", topic);
        void api<Feed>("feed?" + params)
          .then((x) => {
            if (live) setFeed(x);
          })
          .catch((e) => {
            if (live) {
              setError(e.message);
              checkAccess(e, true);
            }
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
  }, [screen, tab, query, community, topic, revision]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const read = () => {
      const id = location.hash.match(/^#post-([0-9a-f-]{36})$/)?.[1];
      if (id) void openComments(id);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  async function action(key: string, task: () => Promise<void>) {
    if (pending.includes(key)) return;
    setPending((x) => [...x, key]);
    setError("");
    try {
      await task();
    } catch (e) {
      checkAccess(e);
      const status = (e as { status?: number }).status;
      setError(
        status === 400
          ? "Check the post details and try again."
          : status === 403
            ? "Join the community before posting, and make sure your session is still active."
            : status === 409
              ? "This change could not be completed. Community owners must transfer ownership before leaving."
              : (e as Error).message,
      );
    } finally {
      setPending((x) => x.filter((k) => k !== key));
    }
  }
  function patch(post: FeedPost) {
    setFeed((f) =>
      f
        ? { ...f, items: f.items.map((p) => (p.id === post.id ? post : p)) }
        : f,
    );
    setSelected((p) => (p?.id === post.id ? post : p));
  }
  function react(p: FeedPost, kind: "like" | "save" | "repost") {
    void action(p.id, async () => {
      const active = !(kind === "like"
        ? p.liked
        : kind === "save"
          ? p.saved
          : p.reposted);
      patch(await api<FeedPost>(`posts/${p.id}/${kind}`, "PUT", { active }));
      if (screen === "saved" && kind === "save" && !active)
        setRevision((x) => x + 1);
    });
  }
  async function openComments(value: FeedPost | string) {
    setCommentsLoading(true);
    setComments([]);
    setCommentText("");
    try {
      const p =
        typeof value === "string"
          ? await api<FeedPost>("posts/" + value)
          : value;
      setSelected(p);
      setComments(await api<FeedComment[]>(`posts/${p.id}/comments`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCommentsLoading(false);
    }
  }
  async function share(post: FeedPost) {
    const url = new URL("/", location.origin);
    url.hash = "post-" + post.id;
    try {
      if (navigator.share)
        await navigator.share({
          title: "A conversation on Circle.social",
          url: url.href,
        });
      else {
        await navigator.clipboard.writeText(url.href);
        setNotice("Post link copied.");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setError("The link could not be shared. Please try again.");
    }
  }
  function showCommunity(c: CommunitySummary) {
    setCommunity(c);
    setCommunityTab("latest");
    setTab("for-you");
    setScreen("feed");
    setQuery("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function startCompose() {
    setCompose(true);
  }
  async function notifications() {
    setActivityOpen(true);
    await action("activity", async () => {
      const value = await api<typeof activity>("activity");
      setActivity(value);
      if (value.items.some((x) => !x.readAt))
        setActivity(
          await api<typeof activity>("activity/read", "POST", {
            ids: value.items.map((x) => x.id),
          }),
        );
    });
  }
  const members = new Set(feed?.communities.map((c) => c.id) ?? []);
  const cards = feed?.items ?? [];
  return (
    <main
      className="feed-shell identity-shell"
      data-theme={palette}
      aria-label="Home feed"
      style={
        {
          "--wallpaper-url": `url("${ONBOARDING_BACKGROUNDS.find((x) => x.id === profile.onboarding?.backgroundId)?.path ?? "/onboarding/ember.jpg"}")`,
        } as CSSProperties
      }
    >
      <div className="feed-app">
        <nav className="feed-navigation" aria-label="Main navigation">
          <div className="feed-rail-brand">
            <BrandMark className="brand-mark" />
            <Wordmark />
          </div>
          {(
            [
              { key: "feed", label: "Feed", icon: "home" },
              { key: "discover", label: "Discover", icon: "search" },
              { key: "communities", label: "Communities", icon: "people" },
              { key: "profile", label: "Profile", icon: "person" },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              aria-label={item.key === "profile" ? "Your profile" : item.label}
              aria-current={
                item.key === screen ||
                (item.key === "feed" && screen === "saved")
                  ? "page"
                  : undefined
              }
              onClick={() => {
                if (item.key === "profile") onProfile();
                else {
                  setDiscoveryTab("trending");
                  setScreen(item.key);
                  setQuery("");
                  setTopic("");
                }
              }}
            >
              <Icon
                name={item.icon}
                filled={
                  item.key === "feed" &&
                  (screen === "feed" || screen === "saved")
                }
              />
              <span>{item.label}</span>
            </button>
          ))}
          <button
            className="feed-desktop-only"
            onClick={() => setScreen("saved")}
            aria-current={screen === "saved" ? "page" : undefined}
          >
            <Icon name="bookmark" />
            <span>Saved posts</span>
          </button>
          <div className="feed-rail-account">
            <div className="feed-avatar">
              <Avatar avatar={profile.avatar} seed={profile.handle} size={48} />
            </div>
            <strong>@{profile.handle}</strong>
            <button
              className="quiet"
              onClick={() =>
                void action("logout", async () => {
                  await api("auth/logout", "POST", {});
                  onSignOut();
                })
              }
            >
              Sign out
            </button>
          </div>
        </nav>
        <div className="feed-lane">
          <header className="feed-header">
            <h1>{screen === "discover" ? "Discover" : <Wordmark />}</h1>
            <div>
              <button
                className="feed-icon-button"
                aria-label="Search Circle.social"
                onClick={() => {
                  setDiscoveryTab("trending");
                  setScreen("discover");
                }}
              >
                <Icon name="search" />
              </button>
              <button
                className="feed-icon-button feed-notification-button"
                aria-label={`Notifications${activity.unreadCount ? `, ${activity.unreadCount} unread` : ""}`}
                onClick={() => void notifications()}
              >
                <Icon name="bell" />
                {activity.unreadCount > 0 && (
                  <b>
                    {activity.unreadCount > 9 ? "9+" : activity.unreadCount}
                  </b>
                )}
              </button>
            </div>
          </header>
          {onReturnToApp && (
            <button className="feed-return" onClick={onReturnToApp}>
              Continue to app <Icon name="share" size={16} />
            </button>
          )}
          {screen === "feed" && !community && (
            <div className="feed-tabs" role="tablist" aria-label="Feed filters">
              {(
                [
                  { id: "for-you", label: "For You" },
                  { id: "following", label: "Following" },
                  { id: "trending", label: "Trending" },
                ] as const
              ).map((t) => (
                <button
                  role="tab"
                  key={t.id}
                  aria-selected={tab === t.id}
                  onClick={() => {
                    setTab(t.id);
                    setCommunity(null);
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          {screen === "discover" && (
            <DiscoveryPanel
              onCategory={setDiscoveryTab}
              query={query}
              onQuery={setQuery}
              onTopic={(id) => {
                setTopic(id);
                setTab("trending");
              }}
              onCommunity={showCommunity}
              onMembership={() => setRevision((x) => x + 1)}
            />
          )}
          {screen === "discover" && topic && (
            <button className="feed-secondary" onClick={() => setTopic("")}>
              Clear topic filter ×
            </button>
          )}
          {screen === "saved" && (
            <div className="feed-view-title">
              <h2>Saved posts</h2>
              <button
                className="feed-icon-button"
                aria-label="Back to feed"
                onClick={() => setScreen("feed")}
              >
                <Icon name="arrow" />
              </button>
            </div>
          )}
          {community && screen === "feed" && (
            <CommunityDetail
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
          {error && (
            <div className="feed-error" role="alert">
              {error}
              <button onClick={() => setRevision((x) => x + 1)}>
                Try again
              </button>
            </div>
          )}
          {screen === "communities" ? (
            <section className="feed-communities">
              <p className="eyebrow">ONE IDENTITY. FIVE COMMUNITIES.</p>
              <h2>Find your people.</h2>
              <p>Your place for every side of you.</p>
              {catalog.map((c) => (
                <article key={c.id} className="feed-community-card">
                  <div className="feed-community-art">
                    {COMMUNITY_COVERS[c.slug] ? (
                      <Image
                        src={COMMUNITY_COVERS[c.slug]}
                        alt=""
                        width={160}
                        height={160}
                        sizes="(max-width: 760px) 42vw, 260px"
                      />
                    ) : (
                      <BrandMark />
                    )}
                  </div>
                  <div>
                    <button onClick={() => showCommunity(c)}>
                      <h3>{c.name}</h3>
                    </button>
                    <p>{c.description}</p>
                    <span>
                      {members.has(c.id) ? "You’re a member" : "Open community"}
                    </span>
                  </div>
                  <button
                    className={
                      members.has(c.id) ? "feed-secondary" : "feed-primary"
                    }
                    disabled={pending.includes(c.id)}
                    onClick={() =>
                      void action(c.id, async () => {
                        await api(`communities/${c.id}/membership`, "PUT", {
                          active: !members.has(c.id),
                        });
                        setRevision((x) => x + 1);
                        setNotice(
                          members.has(c.id)
                            ? `You left ${c.name}.`
                            : `You joined ${c.name}.`,
                        );
                      })
                    }
                  >
                    {members.has(c.id) ? "Joined ✓" : "Join"}
                  </button>
                </article>
              ))}
            </section>
          ) : (
            <section
              className="feed-stream"
              hidden={
                (!!community &&
                  screen === "feed" &&
                  communityTab === "about") ||
                (screen === "discover" && discoveryTab !== "trending")
              }
              aria-label="Personalized feed"
              aria-busy={loading}
            >
              {loading ? (
                <div className="feed-loading" role="status">
                  <div className="feed-skeleton" />
                  <div className="feed-skeleton" />
                  <span>Loading conversations…</span>
                </div>
              ) : error ? null : cards.length ? (
                cards.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    profile={profile}
                    busy={pending.includes(p.id)}
                    onReact={react}
                    onComments={(p) => void openComments(p)}
                    onShare={(p) => void share(p)}
                    onCommunity={showCommunity}
                    onRemove={setRemovePost}
                    onFollow={(p) =>
                      void action(p.id, async () => {
                        await api(
                          `profiles/${encodeURIComponent(p.author.handle)}/follow`,
                          "PUT",
                          { active: !p.following },
                        );
                        setFeed((f) =>
                          f
                            ? {
                                ...f,
                                items: f.items.map((x) =>
                                  x.author.handle === p.author.handle
                                    ? { ...x, following: !p.following }
                                    : x,
                                ),
                              }
                            : f,
                        );
                        if (tab === "following") setRevision((x) => x + 1);
                        setNotice(
                          p.following
                            ? `Unfollowed @${p.author.handle}.`
                            : `Following @${p.author.handle}.`,
                        );
                      })
                    }
                  />
                ))
              ) : (
                !error && (
                  <div className="feed-empty">
                    <BrandMark />
                    <p className="eyebrow">REAL PEOPLE. OPEN CONVERSATIONS.</p>
                    <h2>
                      {screen === "saved"
                        ? "Keep a little inspiration."
                        : screen === "discover"
                          ? "A new conversation is out there."
                          : tab === "following"
                            ? "Find the voices you connect with."
                            : "Your circle starts here."}
                    </h2>
                    <p>
                      {screen === "saved"
                        ? "Tap the bookmark on any post to find it here."
                        : screen === "discover"
                          ? "Try another search or explore a community."
                          : tab === "following"
                            ? "Follow people from their post menu. Their conversations will appear here."
                            : "No posts match your communities and interests yet. Share the first thought, story or little win."}
                    </p>
                    <button
                      className="feed-primary"
                      onClick={
                        tab === "following"
                          ? () => setScreen("discover")
                          : startCompose
                      }
                    >
                      {tab === "following"
                        ? "Discover people"
                        : "Start a conversation"}
                    </button>
                    <button
                      className="feed-text-button"
                      onClick={() => setScreen("communities")}
                    >
                      Explore communities
                    </button>
                  </div>
                )
              )}
            </section>
          )}
          <button
            className="feed-compose-fab"
            aria-label="Create post"
            onClick={startCompose}
          >
            <Icon name="plus" size={30} />
          </button>
          <footer className="feed-lane-footer">
            <span>Real People. Open Conversations.</span>
            <button
              className="feed-icon-button"
              aria-label="Refresh feed"
              onClick={() => setRevision((x) => x + 1)}
            >
              <Icon name="refresh" size={17} />
            </button>
            <button
              className="feed-text-button feed-mobile-save"
              onClick={() => setScreen("saved")}
            >
              Saved
            </button>
          </footer>
        </div>
        <aside className="feed-sidebar">
          <div className="feed-sidebar-card">
            <p className="eyebrow">YOUR CIRCLE</p>
            <h2>
              Same you.
              <br />
              <span>New perspectives.</span>
            </h2>
            <p>There’s room for every side of you.</p>
            <button className="feed-primary" onClick={startCompose}>
              Share a thought <Icon name="plus" size={17} />
            </button>
          </div>
          <div className="feed-sidebar-communities">
            <h3>Your communities</h3>
            {feed?.communities.length ? (
              feed.communities.map((c) => (
                <button key={c.id} onClick={() => showCommunity(c)}>
                  <span className="feed-small-mark">
                    {COMMUNITY_COVERS[c.slug] ? (
                      <Image
                        src={COMMUNITY_COVERS[c.slug]}
                        alt=""
                        width={40}
                        height={40}
                      />
                    ) : (
                      "◌"
                    )}
                  </span>
                  {c.name}
                  <Icon name="share" size={14} />
                </button>
              ))
            ) : (
              <p>Find a space that gets you.</p>
            )}
            <button
              className="feed-text-button"
              onClick={() => setScreen("communities")}
            >
              Explore all five →
            </button>
          </div>
          <p className="feed-sidebar-note">
            Pseudonymous by design.
            <br />
            Meaningful by choice.
          </p>
        </aside>
      </div>
      {notice && (
        <div className="feed-toast" role="status">
          {notice}
        </div>
      )}
      {removed && (
        <div className="feed-undo" role="status">
          Post removed.
          <button
            onClick={() =>
              void action("restore", async () => {
                await api(`posts/${removed}/restore`, "POST", {});
                setRemoved(null);
                setRevision((x) => x + 1);
              })
            }
          >
            Undo
          </button>
        </div>
      )}
      {compose && (
        <Dialog title="Create post" onClose={() => setCompose(false)}>
          <PostComposer
            communities={feed?.communities ?? []}
            initialCommunity={
              feed?.communities.find((c) => c.id === community?.id)?.id
            }
            onClose={() => setCompose(false)}
            onPublished={(post) => {
              setCompose(false);
              setScreen("feed");
              setTab("for-you");
              setCommunity(post.community);
              setCommunityTab("latest");
              setRevision((x) => x + 1);
              setNotice("Your post is live.");
            }}
          />
        </Dialog>
      )}
      {selected && (
        <Dialog
          title="Post"
          onClose={() => {
            setSelected(null);
            if (location.hash.startsWith("#post-"))
              history.replaceState(
                null,
                "",
                location.pathname + location.search,
              );
          }}
        >
          <PostCard
            post={selected}
            profile={profile}
            busy={pending.includes(selected.id)}
            onReact={react}
            onComments={() =>
              document.getElementById("feed-comment-input")?.focus()
            }
            onShare={(p) => void share(p)}
            onFollow={(p) =>
              void action("follow", async () => {
                await api(`profiles/${p.author.handle}/follow`, "PUT", {
                  active: !p.following,
                });
                patch({ ...p, following: !p.following });
              })
            }
            onRemove={(p) => {
              setSelected(null);
              setRemovePost(p);
            }}
            onCommunity={(c) => {
              setSelected(null);
              showCommunity(c);
            }}
          />
          {error && (
            <p role="alert" className="feed-error">
              {error}
            </p>
          )}
          <div className="feed-comments">
            <h3>Comments ({selected.counts.comments})</h3>
            {commentsLoading ? (
              <p role="status">Loading comments…</p>
            ) : comments.length ? (
              comments.map((c) => (
                <article key={c.id}>
                  <span className="feed-avatar">
                    <Avatar
                      avatar={c.author.avatar}
                      seed={c.author.handle}
                      size={36}
                    />
                  </span>
                  <div>
                    <strong>@{c.author.handle}</strong>
                    <time dateTime={c.createdAt}>{timeAgo(c.createdAt)}</time>
                    <p>{c.text}</p>
                  </div>
                </article>
              ))
            ) : (
              <p className="feed-fine-print">
                Be the first to join the conversation.
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
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
                });
              }}
            >
              <label
                className="feed-visually-hidden"
                htmlFor="feed-comment-input"
              >
                Your comment
              </label>
              <input
                disabled={pending.includes("comment")}
                id="feed-comment-input"
                value={commentText}
                maxLength={500}
                placeholder="Add a comment…"
                onChange={(e) => setCommentText(e.target.value)}
              />
              <button
                className="feed-primary"
                disabled={!commentText.trim() || pending.includes("comment")}
              >
                Send
              </button>
            </form>
          </div>
        </Dialog>
      )}
      {activityOpen && (
        <Dialog title="Notifications" onClose={() => setActivityOpen(false)}>
          {error && (
            <p role="alert" className="feed-error">
              {error}
            </p>
          )}
          <div className="feed-activity">
            {pending.includes("activity") ? (
              <p role="status">Loading activity…</p>
            ) : activity.items.length ? (
              activity.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    if (item.postId) {
                      setActivityOpen(false);
                      void openComments(item.postId);
                    }
                  }}
                  disabled={!item.postId}
                >
                  <span className="feed-avatar">
                    <Avatar
                      avatar={item.actor.avatar}
                      seed={item.actor.handle}
                      size={36}
                    />
                  </span>
                  <span>
                    <strong>@{item.actor.handle}</strong>{" "}
                    {(
                      {
                        LIKE: "liked your post",
                        COMMENT: "commented on your post",
                        REPOST: "reposted your post",
                        FOLLOW: "started following you",
                      } as Record<string, string>
                    )[item.kind] ?? "joined the conversation"}
                    <small>{timeAgo(item.createdAt)}</small>
                  </span>
                </button>
              ))
            ) : (
              <div className="feed-empty">
                <Icon name="bell" size={40} />
                <h3>Your conversations, all here.</h3>
                <p>
                  Likes, comments, reposts and new followers will appear here.
                </p>
              </div>
            )}
          </div>
        </Dialog>
      )}
      {removePost && (
        <Dialog title="Remove post" onClose={() => setRemovePost(null)}>
          <p>
            Remove this post from conversations? You can undo this after
            removing it.
          </p>
          <button
            className="feed-primary"
            disabled={pending.includes("remove")}
            onClick={() =>
              void action("remove", async () => {
                await api(`posts/${removePost.id}`, "DELETE");
                setRemoved(removePost.id);
                setRemovePost(null);
                setRevision((x) => x + 1);
              })
            }
          >
            Remove post
          </button>
        </Dialog>
      )}
    </main>
  );
}
