"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { COMMUNITY_COVERS } from "@circle/constants";
import type {
  CommunityDetail as Detail,
  CommunitySummary,
} from "@circle/shared-types";
import { api } from "./identity-panel";
import Icon from "./feed-icons";
export default function CommunityDetail({
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
  const [data, setData] = useState<Detail | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    void api<Detail>(`communities/${community.id}/detail`)
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
    <section className="community-detail">
      <div className="community-hero">
        {COMMUNITY_COVERS[community.slug] && (
          <Image
            src={COMMUNITY_COVERS[community.slug]}
            alt=""
            width={800}
            height={420}
            sizes="(max-width:760px) 100vw, 640px"
            loading="eager"
          />
        )}
        <button
          className="feed-icon-button"
          aria-label="Back to communities"
          onClick={onBack}
        >
          <Icon name="arrow" />
        </button>
      </div>
      <div className="community-detail-info">
        <div className="community-detail-title">
          {COMMUNITY_COVERS[community.slug] && (
            <Image
              src={COMMUNITY_COVERS[community.slug]}
              alt=""
              width={64}
              height={64}
            />
          )}
          <div>
            <h2>{community.name}</h2>
            <p>
              {data
                ? `${data.memberCount} ${data.memberCount === 1 ? "member" : "members"} · Public`
                : "Loading…"}
            </p>
          </div>
        </div>
        <p>{community.description}</p>
        <button
          className={data?.joined ? "feed-secondary" : "feed-primary"}
          disabled={busy || !data}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await api(`communities/${community.id}/membership`, "PUT", {
                active: !data?.joined,
              });
              setRevision((x) => x + 1);
              onChanged();
            } catch {
              setError(
                "Could not change membership. Owners must transfer ownership before leaving.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : data?.joined ? "Joined ✓" : "Join"}
        </button>
        {error && (
          <p role="alert" className="feed-error">
            {error}
          </p>
        )}
      </div>
      <div className="feed-tabs" role="tablist" aria-label="Community feed">
        {(["latest", "trending", "about"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => onTab(t)}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {tab === "about" && (
        <div className="community-about">
          <h3>About {community.name}</h3>
          <p>{community.description}</p>
          <p>{data?.postCount ?? 0} posts · Public community</p>
          <h3>Keep the circle welcoming.</h3>
          <p>
            Respect others, protect personal information, and share your own
            experiences. Your identity remains pseudonymous across communities.
          </p>
        </div>
      )}
    </section>
  );
}
