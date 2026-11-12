"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { INTERESTS } from "@circle/constants";
import type {
  CommunitySummary,
  FeedPost,
  PostMedia,
} from "@circle/shared-types";
import { api } from "./identity-panel";
import Icon from "./feed-icons";
const time = (n: number) =>
  `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
// A bounded PCM WAV makes recorded audio playable and verifiable across browsers.
async function wav(blob: Blob): Promise<Blob> {
  const context = new AudioContext();
  try {
    const input = await context.decodeAudioData(await blob.arrayBuffer());
    if (input.duration > 120.5)
      throw new Error("Keep your recording under two minutes.");
    const offline = new OfflineAudioContext(
        1,
        Math.ceil(input.duration * 16000),
        16000,
      ),
      source = offline.createBufferSource();
    source.buffer = input;
    source.connect(offline.destination);
    source.start();
    const samples = (await offline.startRendering()).getChannelData(0),
      buffer = new ArrayBuffer(44 + samples.length * 2),
      view = new DataView(buffer);
    const str = (offset: number, value: string) => {
      for (let i = 0; i < value.length; i++)
        view.setUint8(offset + i, value.charCodeAt(i));
    };
    str(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    str(8, "WAVE");
    str(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true);
    view.setUint32(28, 32000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    str(36, "data");
    view.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++)
      view.setInt16(
        44 + i * 2,
        Math.max(-1, Math.min(1, samples[i])) * 32767,
        true,
      );
    return new Blob([buffer], { type: "audio/wav" });
  } finally {
    await context.close();
  }
}
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
  const [mode, setMode] = useState<"choose" | "text" | "image" | "audio">(
      "choose",
    ),
    [text, setText] = useState(""),
    [community, setCommunity] = useState(
      initialCommunity ?? communities[0]?.id ?? "",
    ),
    [media, setMedia] = useState<PostMedia[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [recording, setRecording] = useState(false),
    [paused, setPaused] = useState(false),
    [seconds, setSeconds] = useState(0),
    [recorded, setRecorded] = useState<Blob | null>(null);
  const preview = useMemo(
    () => (recorded ? URL.createObjectURL(recorded) : ""),
    [recorded],
  );
  const [tags, setTags] = useState<string[]>([]);
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    mounted = useRef(true),
    cancelled = useRef(false),
    secondsRef = useRef(0),
    file = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<PostMedia[]>([]),
    published = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelled.current = true;
      if (recorder.current?.state !== "inactive") recorder.current?.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      if (!published.current)
        mediaRef.current.forEach(
          (m) => void api(`media/${m.id}`, "DELETE").catch(() => {}),
        );
    };
  }, []);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  useEffect(() => {
    if (!recording || paused) return;
    const timer = setInterval(() => {
      secondsRef.current++;
      setSeconds(secondsRef.current);
      if (secondsRef.current >= 120) recorder.current?.stop();
    }, 1000);
    return () => clearInterval(timer);
  }, [recording, paused]);
  async function upload(blob: Blob) {
    if (blob.size > 12 * 1024 * 1024)
      throw new Error("Choose a file smaller than 12 MB.");
    const response = await fetch("/api/v1/media", {
      method: "POST",
      headers: { "Content-Type": blob.type || "image/jpeg" },
      body: blob,
    });
    if (!response.ok)
      throw new Error(
        response.status === 413
          ? "Media storage limit reached. Choose a smaller file."
          : "This file could not be uploaded. Use a JPEG, PNG, WebP image or a recording under two minutes.",
      );
    const item = (await response.json()).data as PostMedia;
    if (!mounted.current) {
      void api(`media/${item.id}`, "DELETE").catch(() => {});
      return;
    }
    mediaRef.current = [...mediaRef.current, item];
    setMedia([...mediaRef.current]);
  }
  async function addImages(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    try {
      for (const f of Array.from(files).slice(0, 3 - mediaRef.current.length))
        await upload(f);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  }
  async function start() {
    setError("");
    setRecorded(null);
    secondsRef.current = 0;
    setSeconds(0);
    cancelled.current = false;
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error(
          "Recording is unavailable in this browser. Use a supported browser on HTTPS or localhost.",
        );
      const audio = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        audio.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = audio;
      const mime = ["audio/webm;codecs=opus", "audio/mp4"].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      const rec = new MediaRecorder(
          audio,
          mime ? { mimeType: mime } : undefined,
        ),
        chunks: BlobPart[] = [];
      recorder.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        audio.getTracks().forEach((t) => t.stop());
        if (mounted.current) {
          setRecording(false);
          setPaused(false);
          if (!cancelled.current)
            setRecorded(new Blob(chunks, { type: rec.mimeType }));
        }
      };
      rec.start(1000);
      setRecording(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function saveRecording() {
    if (!recorded) return;
    setBusy(true);
    setError("");
    try {
      await upload(await wav(recorded));
      setRecorded(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(m: PostMedia) {
    setBusy(true);
    try {
      await api(`media/${m.id}`, "DELETE");
      mediaRef.current = mediaRef.current.filter((x) => x.id !== m.id);
      setMedia([...mediaRef.current]);
    } catch {
      setError("Could not remove this attachment. Try again.");
    } finally {
      setBusy(false);
    }
  }
  const dirty =
    !!text.trim() || media.length > 0 || recording || recorded !== null;
  function close() {
    if (!dirty || confirm("Discard this post and its attachments?")) onClose();
  }
  return (
    <div className="publish-flow">
      <header className="publish-header" hidden={mode === "choose"}>
        <button
          type="button"
          className="feed-icon-button"
          aria-label="Back to post types"
          onClick={() => {
            if (mode !== "choose" && !dirty) setMode("choose");
            else close();
          }}
        >
          <Icon name="arrow" />
        </button>

        {mode !== "choose" && (
          <button
            className="feed-primary"
            disabled={
              busy ||
              recording ||
              !!recorded ||
              (!text.trim() && !media.length) ||
              !community
            }
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const post = await api<FeedPost>("posts", "POST", {
                  text,
                  communityId: community,
                  attachmentIds: media.map((m) => m.id),
                  interests: tags,
                });
                published.current = true;
                onPublished(post);
              } catch {
                setError(
                  "Could not publish your post. Check your connection and community membership.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Saving…" : "Post"}
          </button>
        )}
      </header>
      {mode === "choose" ? (
        <>
          <h3>What do you want to share?</h3>
          <div className="publish-types">
            {[
              {
                id: "text",
                name: "Text",
                description: "Share your thoughts",
                icon: "comment",
              },
              {
                id: "image",
                name: "Image",
                description: "Add photos from your gallery",
                icon: "image",
              },
              {
                id: "audio",
                name: "Audio",
                description: "Record a voice post",
                icon: "audio",
              },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setMode(t.id as "text" | "image" | "audio")}
              >
                <span>
                  <Icon name={t.icon as "comment"} size={30} />
                </span>
                <div>
                  <strong>{t.name}</strong>
                  <small>{t.description}</small>
                </div>
                <span>›</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          {(mode !== "audio" || media.length > 0) && (
            <label className="publish-text">
              <span className="feed-visually-hidden">Post text</span>
              <textarea
                aria-label="Post text"
                placeholder={
                  mode === "audio"
                    ? "Add a caption to your voice post…"
                    : "Share what’s on your mind…"
                }
                value={text}
                maxLength={500}
                disabled={busy}
                onChange={(e) => setText(e.target.value)}
              />
              <small>{text.length}/500</small>
            </label>
          )}
          {media.map((m) => (
            <div key={m.id} className="publish-attachment">
              {m.kind === "IMAGE" ? (
                <Image
                  unoptimized
                  width={1600}
                  height={1200}
                  src={`/api${m.url}`}
                  alt="Selected photo"
                />
              ) : (
                <audio controls src={`/api${m.url}`} preload="metadata" />
              )}
              <button
                className="feed-secondary"
                disabled={busy}
                aria-label="Remove attachment"
                onClick={() => void remove(m)}
              >
                Remove
              </button>
            </div>
          ))}
          {mode !== "audio" && (
            <>
              <input
                ref={file}
                className="feed-visually-hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                multiple
                aria-label="Choose post images"
                onChange={(e) => void addImages(e.target.files)}
                disabled={busy || media.length >= 3}
              />
              <button
                className="publish-option"
                disabled={busy || media.length >= 3}
                onClick={() => file.current?.click()}
              >
                <Icon name="image" />
                Add image <small>{media.length}/3</small>
              </button>
            </>
          )}
          {mode !== "audio" && (
            <button
              className="publish-option"
              disabled={busy || !!media.length}
              onClick={() => setMode("audio")}
            >
              <Icon name="audio" />
              Record audio <small>Up to 2 minutes</small>
            </button>
          )}
          {mode === "audio" && !media.length && (
            <section className="voice-recorder">
              <div
                className={`voice-wave ${recording && !paused ? "is-recording" : ""}`}
                aria-hidden="true"
              >
                {Array.from({ length: 35 }, (_, i) => (
                  <i
                    key={i}
                    style={{
                      height: `${8 + Math.sin(i * 2.1) ** 2 * (1 - Math.abs(i - 17) / 20) * 64}px`,
                    }}
                  />
                ))}
              </div>
              <strong role="timer">{time(seconds)} / 2:00</strong>
              {preview && !recording && <audio controls src={preview} />}
              <div className="voice-controls">
                {!recording ? (
                  <button
                    className="feed-primary"
                    disabled={busy}
                    onClick={() => void start()}
                  >
                    {recorded ? "Record again" : "Start recording"}
                  </button>
                ) : (
                  <>
                    <button
                      className="voice-record-button"
                      aria-label={
                        paused ? "Resume recording" : "Pause recording"
                      }
                      onClick={() => {
                        if (paused) recorder.current?.resume();
                        else recorder.current?.pause();
                        setPaused(!paused);
                      }}
                    >
                      {paused ? "▶" : "Ⅱ"}
                    </button>
                    <button
                      className="feed-secondary"
                      onClick={() => recorder.current?.stop()}
                    >
                      Stop recording
                    </button>
                  </>
                )}
                {recorded && (
                  <>
                    <button
                      className="feed-secondary"
                      onClick={() => {
                        setRecorded(null);
                        setSeconds(0);
                      }}
                    >
                      Delete recording
                    </button>
                    <button
                      className="feed-primary"
                      disabled={busy}
                      onClick={() => void saveRecording()}
                    >
                      Save recording
                    </button>
                  </>
                )}
              </div>
              <p className="feed-fine-print">
                Your microphone is used only while recording. Up to two minutes.
              </p>
            </section>
          )}
          <fieldset className="feed-topics">
            <legend>Topics (optional, up to five)</legend>
            {INTERESTS.map((t) => (
              <button
                type="button"
                key={t.id}
                aria-pressed={tags.includes(t.id)}
                disabled={!tags.includes(t.id) && tags.length >= 5}
                onClick={() =>
                  setTags((x) =>
                    x.includes(t.id)
                      ? x.filter((id) => id !== t.id)
                      : [...x, t.id],
                  )
                }
              >
                {t.label}
              </button>
            ))}
          </fieldset>
          <label className="publish-community">
            <span>Add to community</span>
            <select
              aria-label="Post community"
              value={community}
              disabled={busy}
              onChange={(e) => setCommunity(e.target.value)}
            >
              <option value="" disabled>
                Choose a community
              </option>
              {communities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {!communities.length && <p>Join a community before posting.</p>}
        </>
      )}
      {error && (
        <p className="feed-error" role="alert">
          {error}
        </p>
      )}
      {busy && <p role="status">Saving securely…</p>}
    </div>
  );
}
