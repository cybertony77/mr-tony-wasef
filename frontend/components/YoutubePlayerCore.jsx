import { useCallback, useEffect, useId, useRef, useState } from "react";
import VideoWatermarkOverlay from "./VideoWatermarkOverlay";
import {
  SEEK_SECONDS,
  VideoPlayerChromeStyles,
  VideoSeekFeedback,
  getControlsReservedPx,
} from "./videoSeekGestures";

const CONTROLS_HIDE_MS = 2800;
const FEEDBACK_MS = 750;
const DOUBLE_TAP_MS = 300;
const TOUCH_CLICK_GUARD_MS = 450;
const YT_PLAYING = 1;
const YT_PAUSED = 2;
const YT_ENDED = 0;
const YT_BUFFERING = 3;
const YT_CUED = 5;
const DEFAULT_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function formatMediaTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatRate(rate) {
  const n = Number(rate);
  if (!Number.isFinite(n)) return "1x";
  return `${Number.isInteger(n) ? String(n) : String(n)}x`;
}

function getFullscreenElement() {
  if (typeof document === "undefined") return null;
  return (
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement ||
    null
  );
}

async function requestFs(el) {
  if (!el) return;
  if (el.requestFullscreen) return el.requestFullscreen();
  if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
  if (el.msRequestFullscreen) return el.msRequestFullscreen();
}

async function exitFs() {
  if (typeof document === "undefined") return;
  if (document.exitFullscreen) return document.exitFullscreen();
  if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
  if (document.msExitFullscreen) return document.msExitFullscreen();
}

/**
 * YouTube player core (IFrame API + custom chrome).
 * Used only inside the same-origin /api/youtube/[videoId] embed shell.
 */
export default function YoutubePlayerCore({
  youtubeVideoId,
  onThresholdReached,
  thresholdFraction = 0.1,
  watermarkText,
  hideWatermark = false,
  style,
  className,
  /** When true, notify parent frame (postMessage) on threshold. */
  notifyParent = false,
}) {
  const cbRef = useRef(onThresholdReached);
  cbRef.current = onThresholdReached;

  const rootRef = useRef(null);
  const playerRef = useRef(null);
  const speedWrapRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const uiIntervalRef = useRef(null);
  const hideTimerRef = useRef(null);
  const feedbackTimerRef = useRef(null);
  const scrubbingRef = useRef(false);
  const thresholdDoneRef = useRef(false);
  const isHoveredRef = useRef(false);
  const keysArmedRef = useRef(false);
  const pausedRef = useRef(true);
  const lastTapRef = useRef({ at: 0, side: null });
  const pendingClickRef = useRef(null);
  const lastTouchAtRef = useRef(0);
  const menuOpenRef = useRef(false);

  const reactId = useId().replace(/:/g, "");
  const playerDivId = `yt-prog-${reactId}`;

  const [ready, setReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [paused, setPaused] = useState(true);
  const [ended, setEnded] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [scrubValue, setScrubValue] = useState(null);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [playbackRates, setPlaybackRates] = useState(DEFAULT_RATES);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    thresholdDoneRef.current = false;
    keysArmedRef.current = false;
    pausedRef.current = true;
    setReady(false);
    setIsLoading(true);
    setPaused(true);
    setEnded(false);
    setCurrentTime(0);
    setDuration(0);
    setMuted(false);
    setVolume(1);
    setPlaybackRate(1);
    setSpeedOpen(false);
    setFeedback(null);
  }, [youtubeVideoId]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    menuOpenRef.current = speedOpen;
  }, [speedOpen]);

  const armKeys = useCallback(() => {
    keysArmedRef.current = true;
    isHoveredRef.current = true;
  }, []);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const clearFeedbackTimer = useCallback(() => {
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
  }, []);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      if (!scrubbingRef.current && !menuOpenRef.current) {
        setControlsVisible(false);
        setSpeedOpen(false);
      }
    }, CONTROLS_HIDE_MS);
  }, [clearHideTimer]);

  const showGestureFeedback = useCallback(
    (payload) => {
      setFeedback({ ...payload, id: Date.now() });
      clearFeedbackTimer();
      feedbackTimerRef.current = setTimeout(() => {
        setFeedback(null);
        feedbackTimerRef.current = null;
      }, FEEDBACK_MS);
    },
    [clearFeedbackTimer]
  );

  const syncFromPlayer = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    try {
      const dur = Number(player.getDuration?.() || 0);
      const cur = Number(player.getCurrentTime?.() || 0);
      if (Number.isFinite(dur) && dur > 0) setDuration(dur);
      if (!scrubbingRef.current && Number.isFinite(cur)) setCurrentTime(cur);

      const vol = Number(player.getVolume?.());
      if (Number.isFinite(vol)) setVolume(Math.min(1, Math.max(0, vol / 100)));
      setMuted(Boolean(player.isMuted?.()));

      const rate = Number(player.getPlaybackRate?.());
      if (Number.isFinite(rate) && rate > 0) setPlaybackRate(rate);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!youtubeVideoId || typeof window === "undefined") return undefined;

    let destroyed = false;

    const checkProgress = (player) => {
      if (thresholdDoneRef.current || destroyed) return;
      try {
        const dur = player.getDuration();
        const cur = player.getCurrentTime();
        if (dur > 0 && cur / dur >= thresholdFraction) {
          thresholdDoneRef.current = true;
          cbRef.current?.();
          if (notifyParent && typeof window !== "undefined" && window.parent && window.parent !== window) {
            try {
              window.parent.postMessage(
                {
                  source: "yt-safe-player",
                  type: "threshold",
                  videoId: youtubeVideoId,
                },
                window.location.origin
              );
            } catch {
              /* ignore */
            }
          }
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
          }
        }
      } catch {
        /* ignore */
      }
    };

    const hardenIframe = (player) => {
      try {
        const iframe = player?.getIframe?.();
        if (!iframe) return;
        iframe.style.border = "0";
        iframe.style.pointerEvents = "none";
        iframe.style.width = "100%";
        iframe.style.height = "100%";
        iframe.setAttribute("tabindex", "-1");
        iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      } catch {
        /* ignore */
      }
    };

    const disableCaptions = (player) => {
      try {
        player?.unloadModule?.("captions");
        player?.unloadModule?.("cc");
        player?.setOption?.("captions", "track", {});
        player?.setOption?.("cc", "track", {});
      } catch {
        /* ignore */
      }
    };

    const onStateChange = (event) => {
      if (destroyed) return;
      const state = event.data;
      setIsLoading(state === YT_BUFFERING || state === -1);
      setPaused(state !== YT_PLAYING);
      setEnded(state === YT_ENDED);
      if (state === YT_PLAYING) {
        disableCaptions(event.target);
      }
      if (state === YT_PLAYING || state === YT_PAUSED || state === YT_CUED) {
        syncFromPlayer();
      }
      if (state === YT_ENDED || state === YT_PAUSED) {
        setControlsVisible(true);
        clearHideTimer();
      }
      if (state === YT_PLAYING) showControls();
    };

    const initPlayer = () => {
      if (destroyed || !window.YT?.Player) return;
      playerRef.current = new window.YT.Player(playerDivId, {
        videoId: youtubeVideoId,
        width: "100%",
        height: "100%",
        playerVars: {
          // No native YouTube timeline / controls / fullscreen chrome.
          controls: 0,
          fs: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
          playsinline: 1,
          showinfo: 0,
          cc_load_policy: 0,
          // Keep captions/CC off (also enforced in onReady).
          hl: "en",
          autohide: 1,
        },
        events: {
          onReady: (e) => {
            if (destroyed) return;
            hardenIframe(e.target);
            try {
              e.target.setVolume?.(100);
              e.target.unMute?.();
              e.target.setPlaybackRate?.(1);
              // Force captions / CC closed.
              disableCaptions(e.target);
              const rates = e.target.getAvailablePlaybackRates?.();
              if (Array.isArray(rates) && rates.length) {
                setPlaybackRates(rates.filter((r) => Number(r) > 0));
              }
            } catch {
              /* ignore */
            }
            setReady(true);
            setIsLoading(false);
            syncFromPlayer();
            progressIntervalRef.current = setInterval(
              () => checkProgress(e.target),
              500
            );
            uiIntervalRef.current = setInterval(syncFromPlayer, 400);
            showControls();
          },
          onStateChange,
        },
      });
    };

    const pollTimer = setInterval(() => {
      if (destroyed) {
        clearInterval(pollTimer);
        return;
      }
      if (window.YT?.Player) {
        clearInterval(pollTimer);
        initPlayer();
      }
    }, 100);

    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }

    return () => {
      destroyed = true;
      clearInterval(pollTimer);
      clearHideTimer();
      clearFeedbackTimer();
      if (pendingClickRef.current) {
        clearTimeout(pendingClickRef.current);
        pendingClickRef.current = null;
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      if (uiIntervalRef.current) {
        clearInterval(uiIntervalRef.current);
        uiIntervalRef.current = null;
      }
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
    };
  }, [
    youtubeVideoId,
    playerDivId,
    thresholdFraction,
    syncFromPlayer,
    showControls,
    clearHideTimer,
    clearFeedbackTimer,
    notifyParent,
  ]);

  useEffect(() => {
    const syncFs = () => {
      const root = rootRef.current;
      const fs = getFullscreenElement();
      setIsFullscreen(Boolean(root && fs === root));
    };
    document.addEventListener("fullscreenchange", syncFs);
    document.addEventListener("webkitfullscreenchange", syncFs);
    return () => {
      document.removeEventListener("fullscreenchange", syncFs);
      document.removeEventListener("webkitfullscreenchange", syncFs);
    };
  }, []);

  useEffect(() => {
    if (!speedOpen) return undefined;
    const onDoc = (event) => {
      if (speedWrapRef.current && !speedWrapRef.current.contains(event.target)) {
        setSpeedOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, [speedOpen]);

  const togglePlay = useCallback(() => {
    const player = playerRef.current;
    if (!player || !ready) return;
    try {
      const state = player.getPlayerState?.();
      if (state === YT_PLAYING) {
        player.pauseVideo?.();
        showGestureFeedback({ kind: "pause" });
      } else {
        player.playVideo?.();
        showGestureFeedback({ kind: "play" });
      }
    } catch {
      /* ignore */
    }
    showControls();
  }, [ready, showControls, showGestureFeedback]);

  const seekTo = useCallback(
    (next) => {
      const player = playerRef.current;
      if (!player || !ready) return;
      const d = duration > 0 ? duration : Number(player.getDuration?.() || 0);
      if (!(d > 0)) return;
      const t = Math.min(Math.max(0, next), d);
      try {
        player.seekTo?.(t, true);
        setCurrentTime(t);
      } catch {
        /* ignore */
      }
      showControls();
    },
    [ready, duration, showControls]
  );

  const seekBySide = useCallback(
    (side) => {
      const player = playerRef.current;
      if (!player || !ready) return false;
      try {
        const liveDur = Number(player.getDuration?.() || 0);
        const d = liveDur > 0 ? liveDur : duration > 0 ? duration : 0;
        const cur = Number(player.getCurrentTime?.() || currentTime || 0);
        const delta = side === "left" ? -SEEK_SECONDS : SEEK_SECONDS;
        const next = d > 0 ? Math.min(Math.max(0, cur + delta), d) : Math.max(0, cur + delta);
        player.seekTo?.(next, true);
        setCurrentTime(next);
        if (d > 0) setDuration(d);
        // Always show seek UI (same glass ±10s as R2 / Zoom / Google).
        showGestureFeedback({ kind: "seek", side });
        showControls();
        return true;
      } catch {
        return false;
      }
    },
    [ready, duration, currentTime, showGestureFeedback, showControls]
  );

  const toggleMute = useCallback(() => {
    const player = playerRef.current;
    if (!player || !ready) return;
    try {
      if (player.isMuted?.()) {
        player.unMute?.();
        setMuted(false);
      } else {
        player.mute?.();
        setMuted(true);
      }
    } catch {
      /* ignore */
    }
    showControls();
  }, [ready, showControls]);

  const onVolumeChange = useCallback(
    (next01) => {
      const player = playerRef.current;
      if (!player || !ready) return;
      const v = Math.min(1, Math.max(0, Number(next01) || 0));
      try {
        player.setVolume?.(Math.round(v * 100));
        if (v <= 0) {
          player.mute?.();
          setMuted(true);
        } else {
          player.unMute?.();
          setMuted(false);
        }
        setVolume(v);
      } catch {
        /* ignore */
      }
      showControls();
    },
    [ready, showControls]
  );

  const onPlaybackRateChange = useCallback(
    (rate) => {
      const player = playerRef.current;
      if (!player || !ready) return;
      const next = Number(rate);
      if (!Number.isFinite(next) || next <= 0) return;
      try {
        player.setPlaybackRate?.(next);
        setPlaybackRate(next);
      } catch {
        /* ignore */
      }
      setSpeedOpen(false);
      showControls();
    },
    [ready, showControls]
  );

  const toggleFullscreen = useCallback(async () => {
    const root = rootRef.current;
    if (!root) return;
    try {
      if (getFullscreenElement() === root) await exitFs();
      else if (!getFullscreenElement()) await requestFs(root);
    } catch {
      /* ignore */
    }
    showControls();
  }, [showControls]);

  // Same keyboard behavior as R2 / Zoom / Google Meet players.
  useEffect(() => {
    if (!ready) return undefined;

    const isPlayerContextActive = () => {
      const root = rootRef.current;
      const active = typeof document !== "undefined" ? document.activeElement : null;
      const fs = getFullscreenElement();
      if (keysArmedRef.current) return true;
      if (isHoveredRef.current) return true;
      if (!pausedRef.current) return true;
      if (root && fs === root) return true;
      if (root && active && (active === root || root.contains(active))) return true;
      return false;
    };

    const onKeyDownCapture = (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      const target = event.target;
      const tag = target?.tagName;
      if (tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
        return;
      }

      const isRangeInput =
        (tag === "INPUT" && target?.type === "range") ||
        target?.getAttribute?.("role") === "slider";
      if (tag === "INPUT" && !isRangeInput) return;

      const root = rootRef.current;
      if (!root) return;
      const targetInRoot = root.contains(target);
      if (!targetInRoot && !isPlayerContextActive()) return;

      const isLeft = event.key === "ArrowLeft" || event.code === "ArrowLeft";
      const isRight = event.key === "ArrowRight" || event.code === "ArrowRight";
      const isSpace = event.key === " " || event.code === "Space";
      const isF =
        !event.shiftKey &&
        (event.key === "f" || event.key === "F" || event.code === "KeyF");

      if (!isLeft && !isRight && !isF && !isSpace) return;

      // While focused on the scrubber, keep native range behavior for arrows.
      if ((isLeft || isRight) && isRangeInput && targetInRoot) return;

      // Space / F should still work even if focus is on a control.
      if ((isSpace || isF) && event.repeat) return;

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }

      armKeys();
      try {
        root.focus?.({ preventScroll: true });
      } catch {
        /* ignore */
      }

      if (isF) {
        toggleFullscreen();
        return;
      }
      if (isSpace) {
        togglePlay();
        return;
      }
      seekBySide(isLeft ? "left" : "right");
    };

    document.addEventListener("keydown", onKeyDownCapture, true);
    return () => document.removeEventListener("keydown", onKeyDownCapture, true);
  }, [ready, seekBySide, toggleFullscreen, togglePlay, armKeys]);

  const displayTime =
    scrubbingRef.current && scrubValue != null ? scrubValue : currentTime;
  const max = duration > 0 ? duration : 0;
  const blockNativeChrome = paused || ended || isLoading || !ready;
  const volumeShown = muted ? 0 : volume;

  const blockEvent = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const clearPendingClick = () => {
    if (pendingClickRef.current) {
      clearTimeout(pendingClickRef.current);
      pendingClickRef.current = null;
    }
  };

  const onShieldClick = (event) => {
    if (Date.now() - lastTouchAtRef.current < TOUCH_CLICK_GUARD_MS) return;
    const root = rootRef.current;
    if (!root) return;
    armKeys();
    try {
      root.focus?.({ preventScroll: true });
    } catch {
      /* ignore */
    }
    const rect = root.getBoundingClientRect();
    if (event.clientY > rect.bottom - getControlsReservedPx()) return;

    clearPendingClick();
    pendingClickRef.current = setTimeout(() => {
      pendingClickRef.current = null;
      togglePlay();
    }, 260);
  };

  const onShieldDblClick = (event) => {
    if (Date.now() - lastTouchAtRef.current < TOUCH_CLICK_GUARD_MS) return;
    const root = rootRef.current;
    if (!root) return;
    clearPendingClick();
    event.preventDefault();
    event.stopPropagation();
    armKeys();
    try {
      root.focus?.({ preventScroll: true });
    } catch {
      /* ignore */
    }
    const rect = root.getBoundingClientRect();
    if (event.clientY > rect.bottom - getControlsReservedPx()) return;
    const side = event.clientX - rect.left < rect.width / 2 ? "left" : "right";
    seekBySide(side);
  };

  const onShieldTouchEnd = (event) => {
    if (!event.changedTouches || event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    const root = rootRef.current;
    if (!root) return;
    armKeys();
    const rect = root.getBoundingClientRect();
    if (touch.clientY > rect.bottom - getControlsReservedPx()) return;

    lastTouchAtRef.current = Date.now();
    const side = touch.clientX - rect.left < rect.width / 2 ? "left" : "right";
    const now = lastTouchAtRef.current;
    const prev = lastTapRef.current;
    if (now - prev.at <= DOUBLE_TAP_MS && prev.side === side) {
      event.preventDefault();
      clearPendingClick();
      seekBySide(side);
      lastTapRef.current = { at: 0, side: null };
    } else {
      lastTapRef.current = { at: now, side };
      clearPendingClick();
      pendingClickRef.current = setTimeout(() => {
        pendingClickRef.current = null;
        togglePlay();
      }, DOUBLE_TAP_MS + 40);
    }
  };

  if (!youtubeVideoId) return null;

  return (
    <div
      ref={rootRef}
      className={`video-player-root yt-safe-player${className ? ` ${className}` : ""}`}
      style={{
        width: "100%",
        aspectRatio: "16 / 9",
        maxHeight: "100vh",
        backgroundColor: "#000",
        position: "relative",
        overflow: "hidden",
        outline: "none",
        ...(isFullscreen
          ? {
              width: "100vw",
              height: "100vh",
              aspectRatio: "auto",
              maxHeight: "none",
            }
          : null),
        ...style,
      }}
      tabIndex={0}
      onContextMenu={blockEvent}
      onMouseEnter={() => {
        armKeys();
      }}
      onMouseLeave={() => {
        isHoveredRef.current = false;
      }}
      onFocus={() => {
        armKeys();
      }}
      onMouseMove={() => {
        armKeys();
        showControls();
      }}
      onTouchStart={() => {
        armKeys();
        showControls();
      }}
    >
      {/* Visual-only YouTube surface — no native timeline/controls interaction */}
      <div
        className="yt-safe-iframe-wrap"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
        <div
          id={playerDivId}
          style={{
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        />
      </div>

      {/* Catch-all shield so YouTube chrome never receives clicks */}
      <div
        aria-hidden
        className="yt-safe-shield"
        onClick={onShieldClick}
        onDoubleClick={onShieldDblClick}
        onTouchEnd={onShieldTouchEnd}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 4,
          cursor: "pointer",
          background: blockNativeChrome ? "rgba(0,0,0,0.35)" : "transparent",
          touchAction: "manipulation",
          pointerEvents: speedOpen ? "none" : "auto",
        }}
      />

      {isLoading || !ready ? (
        <div
          className="video-premium-loader"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label="Loading video"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            background: "rgba(0,0,0,0.28)",
          }}
        >
          <div
            className="video-premium-spinner"
            aria-hidden
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              border: "3px solid rgba(255,255,255,0.22)",
              borderTopColor: "#1fa8dc",
              animation: "ytSafeSpin 0.75s linear infinite",
              boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.15)",
            }}
          />
        </div>
      ) : null}

      {/* Custom playback controls (the only UI students use) */}
      <div
        className={`yt-safe-controls${controlsVisible ? " is-visible" : ""}`}
        onMouseMove={(e) => {
          e.stopPropagation();
          showControls();
        }}
        onTouchStart={(e) => {
          e.stopPropagation();
          armKeys();
          showControls();
        }}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 250,
          padding: "10px 12px max(12px, env(safe-area-inset-bottom, 0px))",
          background:
            "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.5) 55%, transparent 100%)",
          opacity: controlsVisible ? 1 : 0,
          pointerEvents: controlsVisible || speedOpen ? "auto" : "none",
          transition: "opacity 0.18s ease",
          boxSizing: "border-box",
          overflow: "visible",
        }}
      >
        <input
          type="range"
          className="yt-safe-progress"
          aria-label="Seek"
          min={0}
          max={max || 0}
          step={0.1}
          value={max > 0 ? Math.min(displayTime, max) : 0}
          disabled={!(max > 0)}
          onPointerDown={() => {
            scrubbingRef.current = true;
            clearHideTimer();
            setControlsVisible(true);
          }}
          onPointerUp={() => {
            scrubbingRef.current = false;
            setScrubValue(null);
            showControls();
          }}
          onChange={(e) => {
            const next = Number(e.target.value);
            setScrubValue(next);
            seekTo(next);
          }}
          style={{
            width: "100%",
            display: "block",
            margin: "0 0 8px",
            height: 6,
            cursor: "pointer",
            accentColor: "#1FA8DC",
            touchAction: "none",
          }}
        />

        <div
          className="yt-safe-buttons"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "#fff",
            minHeight: 36,
          }}
        >
          <button
            type="button"
            className="yt-safe-btn"
            aria-label={paused || ended ? "Play" : "Pause"}
            onClick={togglePlay}
            style={iconBtnStyle}
          >
            {paused || ended ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M6 5h4v14H6zm8 0h4v14h-4z" />
              </svg>
            )}
          </button>

          <span
            className="yt-safe-time"
            style={{
              fontSize: 13,
              fontVariantNumeric: "tabular-nums",
              fontFamily: "Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif",
              whiteSpace: "nowrap",
              userSelect: "none",
            }}
          >
            {formatMediaTime(displayTime)} / {formatMediaTime(duration)}
          </span>

          <div style={{ flex: 1 }} />

          <button
            type="button"
            className="yt-safe-btn"
            aria-label={muted || volumeShown === 0 ? "Unmute" : "Mute"}
            onClick={toggleMute}
            style={iconBtnStyle}
          >
            {muted || volumeShown === 0 ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M16.5 12A4.5 4.5 0 0014 8.04v2.21l2.45 2.45c.03-.22.05-.45.05-.7zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.04v7.92A4.48 4.48 0 0016.5 12zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
              </svg>
            )}
          </button>

          <input
            type="range"
            className="yt-safe-volume"
            aria-label="Volume"
            min={0}
            max={1}
            step={0.05}
            value={volumeShown}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            style={{
              width: 84,
              height: 5,
              cursor: "pointer",
              accentColor: "#fff",
              touchAction: "none",
            }}
          />

          <div ref={speedWrapRef} style={{ position: "relative" }}>
            <button
              type="button"
              className="yt-safe-btn yt-safe-speed-btn"
              aria-label="Playback speed"
              aria-haspopup="menu"
              aria-expanded={speedOpen}
              onClick={() => {
                setSpeedOpen((o) => !o);
                showControls();
              }}
              style={{
                ...iconBtnStyle,
                minWidth: 44,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.02em",
                fontFamily: "Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif",
              }}
            >
              {formatRate(playbackRate)}
            </button>
            {speedOpen ? (
              <div
                role="menu"
                aria-label="Playback speed"
                style={{
                  position: "absolute",
                  right: 0,
                  bottom: "calc(100% + 8px)",
                  minWidth: 88,
                  padding: 6,
                  borderRadius: 10,
                  background: "rgba(15, 23, 42, 0.94)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  boxShadow: "0 12px 28px rgba(0,0,0,0.45)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  zIndex: 400,
                }}
              >
                {playbackRates.map((rate) => {
                  const selected = Math.abs(Number(playbackRate) - Number(rate)) < 0.001;
                  return (
                    <button
                      key={rate}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      onClick={() => onPlaybackRateChange(rate)}
                      style={{
                        appearance: "none",
                        border: "none",
                        background: selected ? "rgba(31,168,220,0.28)" : "transparent",
                        color: "#fff",
                        textAlign: "left",
                        padding: "8px 10px",
                        borderRadius: 7,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif",
                      }}
                    >
                      {formatRate(rate)}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className="yt-safe-btn"
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            onClick={toggleFullscreen}
            style={iconBtnStyle}
          >
            {isFullscreen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {!hideWatermark ? <VideoWatermarkOverlay text={watermarkText} /> : null}

      <VideoSeekFeedback feedback={feedback} />
      <VideoPlayerChromeStyles />

      <style>{`
        html, body, #__next {
          background: #000 !important;
          background-image: none !important;
        }
        @keyframes ytSafeSpin {
          to { transform: rotate(360deg); }
        }
        .yt-safe-player {
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          container-type: size;
        }
        .yt-safe-player:fullscreen,
        .yt-safe-player:-webkit-full-screen {
          width: 100vw !important;
          height: 100vh !important;
          max-height: none !important;
          aspect-ratio: auto !important;
          background: #000 !important;
        }
        .yt-safe-iframe-wrap iframe {
          pointer-events: none !important;
          border: 0 !important;
          width: 100% !important;
          height: 100% !important;
        }
        .yt-safe-player .video-seek-circle {
          width: clamp(56px, 22cqmin, 88px) !important;
          height: clamp(56px, 22cqmin, 88px) !important;
        }
        .yt-safe-player .vc-speed-menu {
          z-index: 420 !important;
          pointer-events: auto !important;
        }
        @media (max-width: 768px) {
          .yt-safe-controls {
            padding: 4px 8px max(6px, env(safe-area-inset-bottom, 0px)) !important;
          }
          .yt-safe-progress {
            height: 4px !important;
            margin-bottom: 4px !important;
          }
          .yt-safe-buttons {
            gap: 2px !important;
            min-height: 28px !important;
          }
          .yt-safe-btn {
            width: 28px !important;
            height: 28px !important;
            min-width: 28px !important;
            min-height: 28px !important;
            border-radius: 6px !important;
          }
          .yt-safe-btn svg {
            width: 16px !important;
            height: 16px !important;
          }
          .yt-safe-time {
            font-size: clamp(10px, 2.8vw, 12px) !important;
          }
          .yt-safe-volume {
            width: 40px !important;
          }
          .yt-safe-speed-btn {
            min-width: 34px !important;
            font-size: 10px !important;
          }
        }
        @media (max-width: 420px) {
          .yt-safe-volume {
            display: none !important;
          }
          .yt-safe-time {
            font-size: 10px !important;
          }
        }
        @media (orientation: landscape) and (max-height: 480px) {
          .yt-safe-controls {
            padding: 3px 8px max(4px, env(safe-area-inset-bottom, 0px)) !important;
          }
          .yt-safe-progress {
            height: 3px !important;
            margin-bottom: 3px !important;
          }
          .yt-safe-btn {
            width: 26px !important;
            height: 26px !important;
            min-width: 26px !important;
            min-height: 26px !important;
          }
        }
      `}</style>
    </div>
  );
}

const iconBtnStyle = {
  appearance: "none",
  border: "none",
  background: "transparent",
  color: "#fff",
  width: 36,
  height: 36,
  borderRadius: 8,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  padding: 0,
};
