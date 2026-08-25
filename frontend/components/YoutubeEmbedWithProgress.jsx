import { useEffect, useMemo, useRef, useState } from "react";
import { VideoPlayerChromeStyles, VideoPremiumLoader } from "./videoSeekGestures";

const YT_ID_RE = /^[a-zA-Z0-9_-]{6,20}$/;

/**
 * YouTube playback — same black surface + spinner as R2 / Zoom / Google Meet.
 * Loads the player through same-origin `/api/youtube/[videoId]` so the parent
 * iframe src is not youtube.com.
 */
export default function YoutubeEmbedWithProgress({
  youtubeVideoId,
  onThresholdReached,
  thresholdFraction = 0.1,
  watermarkText,
  hideWatermark = false,
  style,
  className,
}) {
  const cbRef = useRef(onThresholdReached);
  cbRef.current = onThresholdReached;
  const [frameLoaded, setFrameLoaded] = useState(false);

  const safeId = useMemo(() => {
    const id = String(youtubeVideoId || "").trim();
    return YT_ID_RE.test(id) ? id : "";
  }, [youtubeVideoId]);

  const src = useMemo(() => {
    if (!safeId) return "";
    const q = new URLSearchParams();
    if (Number.isFinite(thresholdFraction) && thresholdFraction > 0) {
      q.set("tf", String(thresholdFraction));
    }
    if (watermarkText) q.set("wm", String(watermarkText));
    if (hideWatermark) q.set("hw", "1");
    const qs = q.toString();
    return `/api/youtube/${encodeURIComponent(safeId)}${qs ? `?${qs}` : ""}`;
  }, [safeId, thresholdFraction, watermarkText, hideWatermark]);

  useEffect(() => {
    setFrameLoaded(false);
  }, [src]);

  useEffect(() => {
    if (!safeId) return undefined;

    const onMessage = (event) => {
      if (typeof window === "undefined") return;
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.source !== "yt-safe-player") return;
      if (data.videoId !== safeId) return;
      if (data.type === "threshold") {
        cbRef.current?.();
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [safeId]);

  if (!safeId || !src) return null;

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "16 / 9",
        maxHeight: "100vh",
        backgroundColor: "#000",
        overflow: "hidden",
        ...style,
      }}
    >
      <iframe
        src={src}
        title="Video player"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => setFrameLoaded(true)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          border: 0,
          display: "block",
          backgroundColor: "#000",
        }}
      />
      {!frameLoaded ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            backgroundColor: "#000",
          }}
        >
          <VideoPlayerChromeStyles />
          <VideoPremiumLoader active label="Loading video" />
        </div>
      ) : null}
    </div>
  );
}
