"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import type { CommunitySummary, Discovery } from "@circle/shared-types";
import { COMMUNITY_COVERS } from "@circle/constants";
import { api } from "./identity-panel";
import Icon from "./feed-icons";
import Avatar from "./avatar";
export default function DiscoveryPanel({
  query,
  onQuery,
  onTopic,
  onCommunity,
  onMembership,
  onCategory,
}: {
  query: string;
  onQuery: (q: string) => void;
  onTopic: (id: string) => void;
  onCommunity: (c: CommunitySummary) => void;
  onMembership: () => void;
  onCategory?: (tab: string) => void;
}) {
  const [tab, setTab] = useState("trending"),
    [data, setData] = useState<Discovery | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(
      () => {
        void api<Discovery>("discover?" + new URLSearchParams({ q: query }))
          .then((x) => {
            if (live) {
              setData(x);
              setError("");
            }
          })
          .catch(() => {
            if (live) setError("Discovery could not load. Try again.");
          });
      },
      query ? 250 : 0,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, revision]);
  async function change(key: string, path: string, active: boolean) {
    setBusy(key);
    setError("");
    try {
      await api(path, "PUT", { active });
      setRevision((x) => x + 1);
      onMembership();
    } catch {
      setError("This change could not be saved. Try again.");
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="discovery-panel">
      <label className="feed-search">
        <Icon name="search" />
        <input
          aria-label="Search posts, people and communities"
          placeholder="Search posts, people, communities…"
          maxLength={80}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      </label>
      <div
        className="feed-tabs discovery-tabs"
        role="tablist"
        aria-label="Discover categories"
      >
        {["trending", "people", "communities"].map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => {
              setTab(t);
              onCategory?.(t);
            }}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {error && (
        <p className="feed-error" role="alert">
          {error}
          <button onClick={() => setRevision((x) => x + 1)}>Retry</button>
        </p>
      )}
      {!data ? (
        <p role="status">Finding conversations…</p>
      ) : (
        <>
          {tab === "trending" && (
            <>
              <h3>Trending Topics</h3>
              {data.topics.length ? (
                data.topics.map((t) => (
                  <button
                    className="discovery-topic"
                    key={t.id}
                    onClick={() => onTopic(t.id)}
                  >
                    <span>#</span>
                    <div>
                      <strong>#{t.label.replaceAll(" ", "")}</strong>
                      <small>
                        {t.posts} {t.posts === 1 ? "post" : "posts"} this week
                      </small>
                    </div>
                    <Icon name="share" size={16} />
                  </button>
                ))
              ) : (
                <p className="feed-fine-print">
                  No trending topics yet. Start a conversation in your
                  community.
                </p>
              )}
              <h3>Recommended Communities</h3>
            </>
          )}
          {tab === "people" ? (
            data.people.length ? (
              data.people.map((p) => (
                <article className="discovery-row" key={p.handle}>
                  <span className="feed-avatar">
                    <Avatar avatar={p.avatar} seed={p.handle} size={42}/>
                  </span>
                  <div>
                    <strong>{p.displayName || p.handle}</strong>
                    <small>@{p.handle}</small>
                  </div>
                  <button
                    className={p.following ? "feed-secondary" : "feed-primary"}
                    disabled={!!busy}
                    onClick={() =>
                      void change(
                        p.handle,
                        `profiles/${p.handle}/follow`,
                        !p.following,
                      )
                    }
                  >
                    {p.following ? "Following" : "Follow"}
                  </button>
                </article>
              ))
            ) : (
              <p>No people match your search.</p>
            )
          ) : (
            data.communities.map((c) => (
              <article className="discovery-row" key={c.id}>
                <button
                  className="discovery-cover"
                  aria-label={`Open ${c.name}`}
                  onClick={() => onCommunity(c)}
                >
                  {COMMUNITY_COVERS[c.slug] && (
                    <Image
                      src={COMMUNITY_COVERS[c.slug]}
                      alt=""
                      width={56}
                      height={56}
                    />
                  )}
                </button>
                <button
                  className="discovery-name"
                  onClick={() => onCommunity(c)}
                >
                  <strong>{c.name}</strong>
                  <small>
                    {c.memberCount} {c.memberCount === 1 ? "member" : "members"}
                  </small>
                </button>
                <button
                  className={c.joined ? "feed-secondary" : "feed-primary"}
                  disabled={!!busy}
                  onClick={() =>
                    void change(
                      c.id,
                      `communities/${c.id}/membership`,
                      !c.joined,
                    )
                  }
                >
                  {c.joined ? "Joined" : "Join"}
                </button>
              </article>
            ))
          )}
        </>
      )}
    </section>
  );
}
