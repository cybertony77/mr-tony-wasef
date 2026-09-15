import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { useVideoSeekGestures, VideoPlayerChromeStyles } from "./videoSeekGestures";

function buildFilesProxyPath(r2Key) {
  if (!r2Key) return null;
  const segments = String(r2Key).split("/").filter(Boolean);
  if (!segments.length) return null;
  return `/api/files/${segments.map((s) => encodeURIComponent(s)).join("/")}`;
}

export default function R2VideoPlayer({
  r2Key,
  videoId,
  onComplete,
  onMilestonePercent,
  watermarkText,
  hideWatermark = false,
}) {
  const playerContainerRef = useRef(null);
  const watermarkRef = useRef(null);
  const videoRef = useRef(null);
  const [error, setError] = useState(null);
  const [watermarkPos, setWatermarkPos] = useState({ x: 0, y: 0 });
  const hasMarkedComplete = useRef(false);
  const hasMilestoneRef = useRef(false);

  const resolvedWatermarkText = useMemo(() => {
    const raw = typeof watermarkText === "string" ? watermarkText.trim() : "";
    return raw || "Protected Video";
  }, [watermarkText]);

  // Same-origin authenticated proxy — cookies sent with <video src>; no presigned URL
  const proxyUrl = useMemo(() => buildFilesProxyPath(r2Key), [r2Key]);

  const { containerProps: seekContainerProps, playerChrome, videoProps } = useVideoSeekGestures(videoRef, {
    enabled: Boolean(proxyUrl) && !error,
    attachKey: proxyUrl,
    containerRef: playerContainerRef,
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !proxyUrl) return;

    const handleTimeUpdate = () => {
      if (!video.duration) return;
      const percent = (video.currentTime / video.duration) * 100;

      if (!hasMilestoneRef.current && percent >= 10 && onMilestonePercent) {
        hasMilestoneRef.current = true;
        onMilestonePercent(videoId, percent);
      }

      if (!hasMarkedComplete.current && percent >= 90) {
        hasMarkedComplete.current = true;
        if (onComplete) {
          onComplete(videoId, percent);
        }
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, [proxyUrl, videoId, onComplete, onMilestonePercent]);

  useEffect(() => {
    hasMarkedComplete.current = false;
    hasMilestoneRef.current = false;
    setError(null);
  }, [r2Key, proxyUrl]);

  const handleRetry = useCallback(() => {
    setError(null);
    const video = videoRef.current;
    if (video && proxyUrl) {
      video.load();
    }
  }, [proxyUrl]);

  const handleVideoError = useCallback(() => {
    setError("Failed to load video. Please try again.");
  }, []);

  useEffect(() => {
    const containerEl = playerContainerRef.current;
    const markEl = watermarkRef.current;
    if (!containerEl || !markEl || !proxyUrl) return;

    let rafId = null;
    let lastTs = 0;
    let vx = 30;
    let vy = 20;
    let x = 20;
    let y = 16;

    const clampToBounds = () => {
      const maxX = Math.max(0, containerEl.clientWidth - markEl.offsetWidth);
      const maxY = Math.max(0, containerEl.clientHeight - markEl.offsetHeight);
      x = Math.max(0, Math.min(x, maxX));
      y = Math.max(0, Math.min(y, maxY));
      setWatermarkPos({ x, y });
      return { maxX, maxY };
    };

    const onResize = () => {
      clampToBounds();
    };

    const tick = (ts) => {
      if (!lastTs) lastTs = ts;
      const dt = Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts;

      const { maxX, maxY } = clampToBounds();
      x += vx * dt;
      y += vy * dt;

      if (x <= 0) {
        x = 0;
        vx = Math.abs(vx);
      } else if (x >= maxX) {
        x = maxX;
        vx = -Math.abs(vx);
      }

      if (y <= 0) {
        y = 0;
        vy = Math.abs(vy);
      } else if (y >= maxY) {
        y = maxY;
        vy = -Math.abs(vy);
      }

      setWatermarkPos({ x, y });
      rafId = requestAnimationFrame(tick);
    };

    clampToBounds();
    rafId = requestAnimationFrame(tick);
    window.addEventListener("resize", onResize);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
    };
  }, [resolvedWatermarkText, proxyUrl]);

  if (!proxyUrl) {
    return (
      <div style={{
        width: '100%',
        aspectRatio: '16 / 9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#000',
        color: '#fff',
        fontSize: '1rem',
      }}>
        No video available
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        width: '100%',
        aspectRatio: '16 / 9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#000',
        color: '#dc3545',
        fontSize: '1rem',
        flexDirection: 'column',
        gap: '12px',
      }}>
        <div>{error}</div>
        <button
          type="button"
          onClick={handleRetry}
          style={{
            padding: '8px 20px',
            backgroundColor: '#1FA8DC',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.9rem',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div
      ref={playerContainerRef}
      {...seekContainerProps}
      style={{
        position: "relative",
        width: "100%",
        height: "auto",
        maxHeight: "min(100vh, 100%)",
        aspectRatio: "16 / 9",
        overflow: "hidden",
        backgroundColor: "#000",
        outline: "none",
      }}
    >
      <VideoPlayerChromeStyles />
      <video
        ref={videoRef}
        src={proxyUrl}
        {...videoProps}
        onContextMenu={(e) => e.preventDefault()}
        onError={handleVideoError}
        style={{
          width: "100%",
          height: "100%",
          maxHeight: "100%",
          aspectRatio: "16 / 9",
          backgroundColor: "#000",
          outline: "none",
          display: "block",
          objectFit: "contain",
        }}
      />

      {playerChrome}

      {!hideWatermark ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 4,
            overflow: "hidden",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
          aria-hidden
        >
          <span
            ref={watermarkRef}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              color: "rgba(255,255,255,0.30)",
              fontSize: "clamp(11px, 1.4vw, 16px)",
              letterSpacing: "1.2px",
              fontWeight: 700,
              textTransform: "uppercase",
              textShadow: "0 1px 2px rgba(0,0,0,0.45)",
              transform: `translate3d(${watermarkPos.x}px, ${watermarkPos.y}px, 0)`,
              whiteSpace: "nowrap",
              mixBlendMode: "screen",
            }}
          >
            {resolvedWatermarkText}
          </span>
        </div>
      ) : null}
    </div>
  );
}
