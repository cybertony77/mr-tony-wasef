import { useCallback, useEffect, useRef, useState } from 'react';

export const SEEK_SECONDS = 10;
const FEEDBACK_MS = 750;
const CONTROLS_HIDE_MS = 2800;
const DOUBLE_TAP_MS = 300;
/** Ignore double-tap seeks on the custom control strip. */
const CONTROLS_RESERVED_PX = 88;
const CONTROLS_RESERVED_MOBILE_PX = 108;
/** Suppress the synthetic click that follows touchend on mobile. */
const TOUCH_CLICK_GUARD_MS = 450;
const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/** Bottom strip reserved for controls — taller on phones for touch. */
export function getControlsReservedPx() {
  if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
    return CONTROLS_RESERVED_MOBILE_PX;
  }
  return CONTROLS_RESERVED_PX;
}

function formatPlaybackRate(rate) {
  const n = Number(rate);
  if (!Number.isFinite(n)) return '1x';
  const label = Number.isInteger(n) ? String(n) : String(n);
  return `${label}x`;
}

/**
 * Seek by delta seconds without pausing, reloading, or changing src.
 * @returns {boolean} whether seek applied
 */
export function seekVideoBy(video, deltaSeconds) {
  if (!video) return false;
  const duration = Number(video.duration);
  if (!Number.isFinite(duration) || duration <= 0) return false;
  const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  const next = Math.min(Math.max(0, current + deltaSeconds), duration);
  try {
    video.currentTime = next;
    return true;
  } catch {
    return false;
  }
}

function formatMediaTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getFullscreenElement() {
  if (typeof document === 'undefined') return null;
  return (
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement ||
    null
  );
}

async function exitFullscreenDoc() {
  if (typeof document === 'undefined') return;
  if (document.exitFullscreen) return document.exitFullscreen();
  if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
  if (document.msExitFullscreen) return document.msExitFullscreen();
}

const STUCK_FS_STYLE_PROPS = [
  'width', 'height', 'max-width', 'max-height', 'aspect-ratio', 'position',
  'inset', 'top', 'right', 'bottom', 'left', 'object-fit', 'display',
  'overflow', 'margin', 'padding', 'border', 'border-radius', 'background',
  'background-color',
];

function clearStuckFullscreenStyles(container, video) {
  [container, video].forEach((el) => {
    if (!el?.style) return;
    STUCK_FS_STYLE_PROPS.forEach((prop) => {
      if (el.style.getPropertyPriority?.(prop) === 'important') {
        el.style.removeProperty(prop);
      }
    });
  });
  if (container?.style?.height === '100vh') {
    container.style.removeProperty('height');
    container.style.removeProperty('width');
  }
}

function isOurFullscreen(fs, container, video) {
  if (!fs) return false;
  if (container && fs === container) return true;
  if (container && container.contains(fs)) return true;
  if (video && fs === video) return true;
  return false;
}

/** Map <video> → player root so native FS can be redirected to the container. */
const videoFullscreenHosts = new WeakMap();
let fullscreenApiPatched = false;

function requestFsOn(el, options) {
  if (!el) return Promise.reject(new Error('No fullscreen target'));
  if (typeof el.requestFullscreen === 'function') {
    const native = HTMLElement.prototype.requestFullscreen;
    if (typeof native === 'function') return native.call(el, options);
    return el.requestFullscreen(options);
  }
  if (typeof el.webkitRequestFullscreen === 'function') {
    return Promise.resolve(el.webkitRequestFullscreen());
  }
  if (typeof el.msRequestFullscreen === 'function') {
    return Promise.resolve(el.msRequestFullscreen());
  }
  return Promise.reject(new Error('Fullscreen unsupported'));
}

/**
 * Chrome/Edge may call video.requestFullscreen() from leftover UA chrome.
 * Always redirect to the player container so custom controls stay in the FS layer.
 */
function ensureFullscreenApiPatch() {
  if (fullscreenApiPatched || typeof HTMLVideoElement === 'undefined') return;
  fullscreenApiPatched = true;

  const proto = HTMLVideoElement.prototype;
  const nativeRF =
    typeof HTMLElement !== 'undefined' && HTMLElement.prototype.requestFullscreen
      ? HTMLElement.prototype.requestFullscreen
      : proto.requestFullscreen;
  const nativeWebkitRF = proto.webkitRequestFullscreen;

  if (typeof nativeRF === 'function') {
    proto.requestFullscreen = function patchedRequestFullscreen(options) {
      const host = videoFullscreenHosts.get(this);
      if (host) return nativeRF.call(host, options);
      return nativeRF.call(this, options);
    };
  }

  if (typeof nativeWebkitRF === 'function') {
    proto.webkitRequestFullscreen = function patchedWebkitRequestFullscreen() {
      const host = videoFullscreenHosts.get(this);
      if (host) {
        const hostWebkit =
          (typeof HTMLElement !== 'undefined' &&
            HTMLElement.prototype.webkitRequestFullscreen) ||
          host.webkitRequestFullscreen;
        if (typeof hostWebkit === 'function') {
          return hostWebkit.call(host);
        }
        if (typeof nativeRF === 'function') {
          return nativeRF.call(host);
        }
      }
      return nativeWebkitRF.call(this);
    };
  }
}

function bindVideoFullscreenHost(video, container) {
  if (!video || !container) return () => {};
  ensureFullscreenApiPatch();
  videoFullscreenHosts.set(video, container);
  return () => {
    if (videoFullscreenHosts.get(video) === container) {
      videoFullscreenHosts.delete(video);
    }
  };
}

/**
 * Fullscreen the player container (never the bare <video> when a container exists).
 */
export async function togglePlayerFullscreen(container, video) {
  const current = getFullscreenElement();
  try {
    if (isOurFullscreen(current, container, video)) {
      await exitFullscreenDoc();
      clearStuckFullscreenStyles(container, video);
      return false;
    }

    if (current) {
      await exitFullscreenDoc();
      return false;
    }

    const target = container || video;
    if (!target) return false;

    try {
      await requestFsOn(target);
      return true;
    } catch {
      // iOS Safari: only the video element can go fullscreen (HTML overlays limited).
      if (video && typeof video.webkitEnterFullscreen === 'function') {
        video.webkitEnterFullscreen();
        return true;
      }
      throw new Error('Fullscreen unsupported');
    }
  } catch {
    clearStuckFullscreenStyles(container, video);
    return Boolean(getFullscreenElement());
  }
}

function IconPlay({ size = 22, className }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      style={{ display: 'block' }}
    >
      {/* Geometrically balanced play triangle (centroid near 12,12) */}
      <path d="M9 6.75v10.5L18 12 9 6.75z" />
    </svg>
  );
}

function IconPause({ size = 22, className }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      style={{ display: 'block' }}
    >
      <path d="M7 5h3.5v14H7zm6.5 0H17v14h-3.5z" />
    </svg>
  );
}

function IconVolume({ muted, size = 20 }) {
  if (muted) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M16.5 12A4.5 4.5 0 0014 8.04v2.21l2.45 2.45c.03-.22.05-.45.05-.7zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.04v7.92A4.48 4.48 0 0016.5 12zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
  );
}

function IconFullscreen({ exit, size = 20 }) {
  if (exit) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
    </svg>
  );
}

/** Simple centered spinner over the video surface (inside fullscreen root). */
export function VideoPremiumLoader({ active, label = 'Loading video' }) {
  if (!active) return null;
  return (
    <div
      className="video-premium-loader"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <div className="video-premium-spinner" aria-hidden />
    </div>
  );
}

/**
 * Custom control bar — React DOM children of .video-player-root (stays in fullscreen).
 */
export function CustomVideoControls({
  visible,
  isFullscreen,
  currentTime,
  duration,
  paused,
  muted,
  volume,
  playbackRate,
  onUserActivity,
  onTogglePlay,
  onToggleMute,
  onVolumeChange,
  onSeekTo,
  onToggleFullscreen,
  onPlaybackRateChange,
  onScrubStart,
  onScrubEnd,
}) {
  const scrubbingRef = useRef(false);
  const [scrubValue, setScrubValue] = useState(null);
  const [speedOpen, setSpeedOpen] = useState(false);
  const speedWrapRef = useRef(null);
  const displayTime = scrubbingRef.current && scrubValue != null ? scrubValue : currentTime;
  const max = Number.isFinite(duration) && duration > 0 ? duration : 0;

  useEffect(() => {
    if (!speedOpen) return undefined;
    const onDoc = (event) => {
      if (speedWrapRef.current && !speedWrapRef.current.contains(event.target)) {
        setSpeedOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
    };
  }, [speedOpen]);

  useEffect(() => {
    if (!visible) setSpeedOpen(false);
  }, [visible]);

  return (
    <div
      className={`custom-video-controls${visible ? ' is-visible' : ''}`}
      onMouseMove={(e) => {
        e.stopPropagation();
        onUserActivity?.();
      }}
      onMouseEnter={() => onUserActivity?.()}
      onTouchStart={() => onUserActivity?.()}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="range"
        className="video-progress"
        aria-label="Seek"
        min={0}
        max={max || 0}
        step={0.1}
        value={max > 0 ? Math.min(displayTime, max) : 0}
        disabled={!(max > 0)}
        onPointerDown={() => {
          scrubbingRef.current = true;
          onScrubStart?.();
          onUserActivity?.();
        }}
        onPointerUp={() => {
          scrubbingRef.current = false;
          setScrubValue(null);
          onScrubEnd?.();
          onUserActivity?.();
        }}
        onChange={(e) => {
          const next = Number(e.target.value);
          setScrubValue(next);
          onSeekTo?.(next);
          onUserActivity?.();
        }}
      />

      <div className="video-control-buttons">
        <button type="button" className="vc-btn" aria-label={paused ? 'Play' : 'Pause'} onClick={onTogglePlay}>
          {paused ? <IconPlay /> : <IconPause />}
        </button>

        <span className="vc-time" aria-live="off">
          {formatMediaTime(displayTime)} / {formatMediaTime(duration)}
        </span>

        <div className="vc-spacer" />

        <button type="button" className="vc-btn" aria-label={muted || volume === 0 ? 'Unmute' : 'Mute'} onClick={onToggleMute}>
          <IconVolume muted={muted || volume === 0} />
        </button>
        <input
          type="range"
          className="video-volume"
          aria-label="Volume"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={(e) => {
            onVolumeChange?.(Number(e.target.value));
            onUserActivity?.();
          }}
        />

        <div className="vc-speed-wrap" ref={speedWrapRef}>
          <button
            type="button"
            className="vc-btn vc-speed-btn"
            aria-label="Playback speed"
            aria-haspopup="menu"
            aria-expanded={speedOpen}
            onClick={() => {
              setSpeedOpen((o) => !o);
              onUserActivity?.();
            }}
          >
            {formatPlaybackRate(playbackRate)}
          </button>
          {speedOpen ? (
            <div className="vc-speed-menu" role="menu" aria-label="Playback speed">
              {PLAYBACK_RATES.map((rate) => {
                const selected = Math.abs(Number(playbackRate) - rate) < 0.001;
                return (
                  <button
                    key={rate}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    className={`vc-speed-option${selected ? ' is-selected' : ''}`}
                    onClick={() => {
                      onPlaybackRateChange?.(rate);
                      setSpeedOpen(false);
                      onUserActivity?.();
                    }}
                  >
                    {formatPlaybackRate(rate)}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="vc-btn"
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          onClick={onToggleFullscreen}
        >
          <IconFullscreen exit={isFullscreen} />
        </button>
      </div>
    </div>
  );
}

/**
 * Shared keyboard + gestures + custom controls for HTML5 <video>.
 */
export function useVideoSeekGestures(
  videoRef,
  { enabled = true, attachKey = null, containerRef = null } = {}
) {
  const [feedback, setFeedback] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMediaLoading, setIsMediaLoading] = useState(true);

  const seekFeedbackTimerRef = useRef(null);
  const controlsHideTimerRef = useRef(null);
  const isHoveredRef = useRef(false);
  const scrubbingRef = useRef(false);
  const lastTapRef = useRef({ at: 0, side: null });

  const clearSeekFeedbackTimer = useCallback(() => {
    if (seekFeedbackTimerRef.current) {
      clearTimeout(seekFeedbackTimerRef.current);
      seekFeedbackTimerRef.current = null;
    }
  }, []);

  const clearControlsHideTimer = useCallback(() => {
    if (controlsHideTimerRef.current) {
      clearTimeout(controlsHideTimerRef.current);
      controlsHideTimerRef.current = null;
    }
  }, []);

  const hideControls = useCallback(() => {
    if (scrubbingRef.current) return;
    setControlsVisible(false);
  }, []);

  const resetControlsHideTimer = useCallback(() => {
    clearControlsHideTimer();
    if (scrubbingRef.current) return;
    controlsHideTimerRef.current = setTimeout(() => {
      controlsHideTimerRef.current = null;
      hideControls();
    }, CONTROLS_HIDE_MS);
  }, [clearControlsHideTimer, hideControls]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    resetControlsHideTimer();
  }, [resetControlsHideTimer]);

  const showSeekFeedback = useCallback(
    (side) => {
      setFeedback({ kind: 'seek', side, id: Date.now() });
      clearSeekFeedbackTimer();
      seekFeedbackTimerRef.current = setTimeout(() => {
        setFeedback(null);
        seekFeedbackTimerRef.current = null;
      }, FEEDBACK_MS);
    },
    [clearSeekFeedbackTimer]
  );

  const showPlayPauseFeedback = useCallback(
    (action) => {
      setFeedback({ kind: action, id: Date.now() });
      clearSeekFeedbackTimer();
      seekFeedbackTimerRef.current = setTimeout(() => {
        setFeedback(null);
        seekFeedbackTimerRef.current = null;
      }, FEEDBACK_MS);
    },
    [clearSeekFeedbackTimer]
  );

  const seekBySide = useCallback(
    (side) => {
      const delta = side === 'left' ? -SEEK_SECONDS : SEEK_SECONDS;
      const video = videoRef.current;
      const ok = seekVideoBy(video, delta);
      if (!ok) return false;
      if (video && Number.isFinite(video.currentTime)) {
        setCurrentTime(video.currentTime);
      }
      showSeekFeedback(side);
      showControls();
      return true;
    },
    [videoRef, showSeekFeedback, showControls]
  );

  const toggleFullscreen = useCallback(() => {
    showControls();
    return togglePlayerFullscreen(containerRef?.current, videoRef.current);
  }, [containerRef, videoRef, showControls]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play()?.catch?.(() => {});
      showPlayPauseFeedback('play');
    } else {
      video.pause();
      showPlayPauseFeedback('pause');
    }
    showControls();
  }, [videoRef, showControls, showPlayPauseFeedback]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    showControls();
  }, [videoRef, showControls]);

  const onVolumeChange = useCallback(
    (next) => {
      const video = videoRef.current;
      if (!video) return;
      const v = Math.min(1, Math.max(0, next));
      video.volume = v;
      video.muted = v === 0;
      setVolume(v);
      setMuted(video.muted);
      showControls();
    },
    [videoRef, showControls]
  );

  const onSeekTo = useCallback(
    (next) => {
      const video = videoRef.current;
      if (!video) return;
      const d = Number(video.duration);
      if (!Number.isFinite(d) || d <= 0) return;
      const t = Math.min(Math.max(0, next), d);
      try {
        video.currentTime = t;
        setCurrentTime(t);
      } catch {
        /* ignore */
      }
      showControls();
    },
    [videoRef, showControls]
  );

  const onPlaybackRateChange = useCallback(
    (rate) => {
      const video = videoRef.current;
      const next = Number(rate);
      if (!video || !Number.isFinite(next) || next <= 0) return;
      try {
        video.playbackRate = next;
        setPlaybackRate(next);
      } catch {
        /* ignore */
      }
      showControls();
    },
    [videoRef, showControls]
  );

  const isPlayerContextActive = useCallback(() => {
    const video = videoRef.current;
    const container = containerRef?.current;
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    const fs = getFullscreenElement();

    if (isHoveredRef.current) return true;
    if (isOurFullscreen(fs, container, video)) return true;
    if (video && (active === video || video.contains?.(active))) return true;
    if (container && active && container.contains(active)) return true;
    return false;
  }, [videoRef, containerRef]);

  // Authoritative custom UI — never leave native controls on.
  useEffect(() => {
    if (!enabled) return undefined;
    const video = videoRef.current;
    if (!video) return undefined;
    video.controls = false;
    video.removeAttribute?.('controls');
    return undefined;
  }, [enabled, videoRef, attachKey]);

  useEffect(
    () => () => {
      clearSeekFeedbackTimer();
      clearControlsHideTimer();
    },
    [clearSeekFeedbackTimer, clearControlsHideTimer]
  );

  // Sync media state from the <video> element.
  useEffect(() => {
    if (!enabled) return undefined;
    const video = videoRef.current;
    if (!video) return undefined;

    setIsMediaLoading(true);
    setPlaybackRate(Number.isFinite(video.playbackRate) ? video.playbackRate : 1);

    const syncMeta = () => {
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      setCurrentTime(Number.isFinite(video.currentTime) ? video.currentTime : 0);
      setPaused(Boolean(video.paused));
      setMuted(Boolean(video.muted));
      setVolume(Number.isFinite(video.volume) ? video.volume : 1);
      setPlaybackRate(Number.isFinite(video.playbackRate) ? video.playbackRate : 1);
    };

    const onTimeUpdate = () => {
      if (scrubbingRef.current) return;
      setCurrentTime(Number.isFinite(video.currentTime) ? video.currentTime : 0);
    };

    const onLoadStart = () => setIsMediaLoading(true);
    const onWaiting = () => setIsMediaLoading(true);
    const onStalled = () => setIsMediaLoading(true);
    const onReady = () => setIsMediaLoading(false);

    syncMeta();
    if (video.readyState >= 3) {
      setIsMediaLoading(false);
    }

    video.addEventListener('loadedmetadata', syncMeta);
    video.addEventListener('durationchange', syncMeta);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('play', syncMeta);
    video.addEventListener('pause', syncMeta);
    video.addEventListener('volumechange', syncMeta);
    video.addEventListener('ratechange', syncMeta);
    video.addEventListener('seeked', onTimeUpdate);
    video.addEventListener('loadstart', onLoadStart);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('stalled', onStalled);
    video.addEventListener('canplay', onReady);
    video.addEventListener('canplaythrough', onReady);
    video.addEventListener('playing', onReady);
    video.addEventListener('loadeddata', onReady);

    return () => {
      video.removeEventListener('loadedmetadata', syncMeta);
      video.removeEventListener('durationchange', syncMeta);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', syncMeta);
      video.removeEventListener('pause', syncMeta);
      video.removeEventListener('volumechange', syncMeta);
      video.removeEventListener('ratechange', syncMeta);
      video.removeEventListener('seeked', onTimeUpdate);
      video.removeEventListener('loadstart', onLoadStart);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('stalled', onStalled);
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('canplaythrough', onReady);
      video.removeEventListener('playing', onReady);
      video.removeEventListener('loadeddata', onReady);
    };
  }, [enabled, videoRef, attachKey]);

  useEffect(() => {
    if (getFullscreenElement()) return;
    const container = containerRef?.current;
    const video = videoRef.current;
    const looksLikeStuckFs =
      container?.style?.getPropertyPriority?.('height') === 'important' ||
      container?.style?.height === '100vh' ||
      video?.style?.getPropertyPriority?.('position') === 'important' ||
      video?.style?.getPropertyPriority?.('inset') === 'important';
    if (!looksLikeStuckFs) return;
    clearStuckFullscreenStyles(container, video);
  }, [containerRef, videoRef, attachKey]);

  // Fullscreen state ↔ document.fullscreenElement
  useEffect(() => {
    if (!enabled) return undefined;

    const syncFullscreen = () => {
      const fs = getFullscreenElement();
      const video = videoRef.current;
      const container = containerRef?.current;
      const active = isOurFullscreen(fs, container, video);
      setIsFullscreen(active);
      if (!active) {
        clearStuckFullscreenStyles(container, video);
      } else {
        showControls();
      }
    };

    const onWebkitBegin = () => {
      setIsFullscreen(true);
      showControls();
    };
    const onWebkitEnd = () => {
      setIsFullscreen(false);
      clearStuckFullscreenStyles(containerRef?.current, videoRef.current);
    };

    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);
    const video = videoRef.current;
    video?.addEventListener?.('webkitbeginfullscreen', onWebkitBegin);
    video?.addEventListener?.('webkitendfullscreen', onWebkitEnd);
    syncFullscreen();

    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('webkitfullscreenchange', syncFullscreen);
      video?.removeEventListener?.('webkitbeginfullscreen', onWebkitBegin);
      video?.removeEventListener?.('webkitendfullscreen', onWebkitEnd);
    };
  }, [enabled, containerRef, videoRef, attachKey, showControls]);

  useEffect(() => {
    if (!enabled) return undefined;
    const video = videoRef.current;
    const container = containerRef?.current;
    if (!video || !container) return undefined;
    return bindVideoFullscreenHost(video, container);
  }, [enabled, containerRef, videoRef, attachKey]);

  // Keyboard: arrows seek ±10; Space play/pause; F fullscreen.
  useEffect(() => {
    if (!enabled) return undefined;

    const onKeyDownCapture = (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      const target = event.target;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return;
      }
      if (target?.getAttribute?.('role') === 'slider') {
        return;
      }

      const video = videoRef.current;
      const container = containerRef?.current;
      if (!video) return;

      const targetIsVideo = target === video || video.contains?.(target);
      const targetInContainer = container && container.contains(target);
      if (!targetIsVideo && !targetInContainer && !isPlayerContextActive()) return;

      const isLeft = event.key === 'ArrowLeft' || event.code === 'ArrowLeft';
      const isRight = event.key === 'ArrowRight' || event.code === 'ArrowRight';
      const isSpace = event.key === ' ' || event.code === 'Space';
      const isF =
        !event.shiftKey &&
        (event.key === 'f' || event.key === 'F' || event.code === 'KeyF');

      if (!isLeft && !isRight && !isF && !isSpace) return;

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }

      if (isF) {
        toggleFullscreen();
        return;
      }
      if (isSpace) {
        togglePlay();
        return;
      }

      seekBySide(isLeft ? 'left' : 'right');
    };

    document.addEventListener('keydown', onKeyDownCapture, true);
    return () => document.removeEventListener('keydown', onKeyDownCapture, true);
  }, [
    enabled,
    seekBySide,
    isPlayerContextActive,
    toggleFullscreen,
    togglePlay,
    videoRef,
    containerRef,
  ]);

  // Pointer activity on the root shows custom controls.
  useEffect(() => {
    if (!enabled) return undefined;
    const container = containerRef?.current;
    if (!container) return undefined;

    const onMove = () => showControls();
    const onDown = () => showControls();

    container.addEventListener('mousemove', onMove);
    container.addEventListener('mousedown', onDown);
    container.addEventListener('touchstart', onDown, { passive: true });

    return () => {
      container.removeEventListener('mousemove', onMove);
      container.removeEventListener('mousedown', onDown);
      container.removeEventListener('touchstart', onDown);
    };
  }, [enabled, containerRef, attachKey, showControls]);

  // Single click = play/pause flash; double-click / double-tap = seek ONLY.
  useEffect(() => {
    if (!enabled) return undefined;
    const video = videoRef.current;
    if (!video) return undefined;

    let clickTimer = null;

    const resolveSide = (clientX, rect) => {
      const x = clientX - rect.left;
      return x < rect.width / 2 ? 'left' : 'right';
    };

    const controlsReserve = () => getControlsReservedPx();

    const inControlsZone = (clientY, rect) => clientY > rect.bottom - controlsReserve();

    const clearClickTimer = () => {
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
    };

    const blockBrowserFullscreenToggle = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
    };

    let lastTouchAt = 0;

    const onClick = (event) => {
      // Ghost click after touchend — already handled by touch path.
      if (Date.now() - lastTouchAt < TOUCH_CLICK_GUARD_MS) return;
      const rect = video.getBoundingClientRect();
      if (inControlsZone(event.clientY, rect)) return;
      clearClickTimer();
      // Delay so a double-click can cancel and seek instead.
      clickTimer = setTimeout(() => {
        clickTimer = null;
        togglePlay();
      }, 260);
    };

    const onDblClick = (event) => {
      if (Date.now() - lastTouchAt < TOUCH_CLICK_GUARD_MS) return;
      const rect = video.getBoundingClientRect();
      clearClickTimer();
      blockBrowserFullscreenToggle(event);
      if (inControlsZone(event.clientY, rect)) return;
      seekBySide(resolveSide(event.clientX, rect));
    };

    const onTouchEnd = (event) => {
      if (!event.changedTouches || event.changedTouches.length !== 1) return;
      const touch = event.changedTouches[0];
      const rect = video.getBoundingClientRect();
      if (inControlsZone(touch.clientY, rect)) return;

      lastTouchAt = Date.now();
      const side = resolveSide(touch.clientX, rect);
      const now = lastTouchAt;
      const prev = lastTapRef.current;

      if (now - prev.at <= DOUBLE_TAP_MS && prev.side === side) {
        event.preventDefault();
        clearClickTimer();
        seekBySide(side);
        lastTapRef.current = { at: 0, side: null };
      } else {
        lastTapRef.current = { at: now, side };
        clearClickTimer();
        clickTimer = setTimeout(() => {
          clickTimer = null;
          togglePlay();
        }, DOUBLE_TAP_MS + 40);
      }
    };

    video.addEventListener('click', onClick);
    video.addEventListener('dblclick', onDblClick, true);
    video.addEventListener('touchend', onTouchEnd, { passive: false });

    return () => {
      clearClickTimer();
      video.removeEventListener('click', onClick);
      video.removeEventListener('dblclick', onDblClick, true);
      video.removeEventListener('touchend', onTouchEnd);
    };
  }, [enabled, videoRef, seekBySide, togglePlay, attachKey]);

  useEffect(() => {
    if (!enabled) return undefined;
    showControls();
    return undefined;
  }, [enabled, attachKey, showControls]);

  const containerProps = {
    tabIndex: 0,
    className: 'video-player-root',
    'data-fullscreen': isFullscreen ? 'true' : 'false',
    'data-controls': controlsVisible ? 'visible' : 'hidden',
    onMouseEnter: () => {
      isHoveredRef.current = true;
      showControls();
    },
    onMouseLeave: () => {
      isHoveredRef.current = false;
      if (!scrubbingRef.current) resetControlsHideTimer();
    },
    onFocus: () => {
      isHoveredRef.current = true;
      showControls();
    },
  };

  const playerChrome = (
    <>
      <VideoPlayerChromeStyles />
      <VideoPremiumLoader active={enabled && isMediaLoading} />
      <CustomVideoControls
        visible={controlsVisible}
        isFullscreen={isFullscreen}
        currentTime={currentTime}
        duration={duration}
        paused={paused}
        muted={muted}
        volume={volume}
        playbackRate={playbackRate}
        onUserActivity={showControls}
        onTogglePlay={togglePlay}
        onToggleMute={toggleMute}
        onVolumeChange={onVolumeChange}
        onSeekTo={onSeekTo}
        onToggleFullscreen={toggleFullscreen}
        onPlaybackRateChange={onPlaybackRateChange}
        onScrubStart={() => {
          scrubbingRef.current = true;
          clearControlsHideTimer();
          setControlsVisible(true);
        }}
        onScrubEnd={() => {
          scrubbingRef.current = false;
          resetControlsHideTimer();
        }}
      />
      <VideoSeekFeedback feedback={feedback} />
    </>
  );

  return {
    feedback,
    containerProps,
    seekBySide,
    isFullscreen,
    toggleFullscreen,
    controlsVisible,
    showControls,
    isMediaLoading,
    playerChrome,
    /** Always false — custom controls are authoritative. */
    videoProps: {
      controls: false,
      controlsList: 'nodownload',
      disablePictureInPicture: true,
      playsInline: true,
    },
  };
}

/** Fullscreen + custom control styles. */
export function VideoPlayerChromeStyles() {
  return (
    <style>{`
      .video-player-root {
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        container-type: size;
        container-name: video-player;
      }
      .video-player-root > video {
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
      }

      .video-player-root:fullscreen,
      .video-player-root:-webkit-full-screen,
      .video-player-root:-moz-full-screen {
        width: 100vw !important;
        height: 100vh !important;
        max-width: none !important;
        max-height: none !important;
        aspect-ratio: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        border-radius: 0 !important;
        background: #000 !important;
        position: relative !important;
        display: block !important;
        overflow: hidden !important;
        box-sizing: border-box !important;
        isolation: isolate !important;
      }
      .video-player-root:fullscreen > video,
      .video-player-root:-webkit-full-screen > video,
      .video-player-root:-moz-full-screen > video {
        position: absolute !important;
        inset: 0 !important;
        width: 100% !important;
        height: 100% !important;
        max-width: none !important;
        max-height: none !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        border-radius: 0 !important;
        aspect-ratio: auto !important;
        object-fit: contain !important;
        background: #000 !important;
        box-sizing: border-box !important;
        z-index: 1 !important;
      }

      .video-player-root .custom-video-controls {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 100;
        padding: 10px 12px max(12px, env(safe-area-inset-bottom, 0px));
        background: linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.45) 55%, transparent 100%);
        opacity: 0;
        pointer-events: none;
        transform: translateY(8px);
        transition: opacity 0.18s ease, transform 0.18s ease;
        box-sizing: border-box;
        overflow: visible;
      }
      .video-player-root .custom-video-controls.is-visible {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(0);
      }
      .video-player-root .video-progress {
        width: 100%;
        display: block;
        margin: 0 0 8px;
        height: 6px;
        cursor: pointer;
        accent-color: #1FA8DC;
        touch-action: none;
      }
      .video-player-root .video-control-buttons {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #fff;
        min-height: 36px;
        overflow: visible;
        position: relative;
        z-index: 2;
      }
      .video-player-root .vc-btn {
        appearance: none;
        border: none;
        background: transparent;
        color: #fff;
        width: 36px;
        height: 36px;
        min-width: 36px;
        min-height: 36px;
        border-radius: 8px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        padding: 0;
        flex-shrink: 0;
        -webkit-tap-highlight-color: transparent;
      }
      .video-player-root .vc-btn:hover {
        background: rgba(255,255,255,0.12);
      }
      .video-player-root .vc-btn:focus-visible {
        outline: 2px solid #1FA8DC;
        outline-offset: 2px;
      }
      .video-player-root .vc-time {
        font-size: 13px;
        font-variant-numeric: tabular-nums;
        font-family: Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif;
        opacity: 0.95;
        white-space: nowrap;
        user-select: none;
      }
      .video-player-root .vc-spacer {
        flex: 1;
        min-width: 4px;
      }
      .video-player-root .video-volume {
        width: 84px;
        height: 5px;
        cursor: pointer;
        accent-color: #fff;
        touch-action: none;
      }

      .video-player-root .vc-speed-wrap {
        position: relative;
      }
      .video-player-root .vc-speed-btn {
        min-width: 44px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.02em;
        font-family: Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif;
      }
      .video-player-root .vc-speed-menu {
        position: absolute;
        right: 0;
        bottom: calc(100% + 8px);
        min-width: 88px;
        padding: 6px;
        border-radius: 10px;
        background: rgba(15, 23, 42, 0.94);
        border: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.45);
        display: flex;
        flex-direction: column;
        gap: 2px;
        z-index: 400;
        pointer-events: auto;
      }
      .video-player-root .vc-speed-option {
        appearance: none;
        border: none;
        background: transparent;
        color: #fff;
        text-align: left;
        padding: 8px 10px;
        border-radius: 7px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        font-family: Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif;
        min-height: 40px;
      }
      .video-player-root .vc-speed-option:hover {
        background: rgba(255, 255, 255, 0.1);
      }
      .video-player-root .vc-speed-option.is-selected {
        background: rgba(31, 168, 220, 0.28);
        color: #fff;
      }

      .video-player-root .video-premium-loader {
        position: absolute;
        inset: 0;
        z-index: 90;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        background: rgba(0, 0, 0, 0.28);
      }
      .video-player-root .video-premium-spinner {
        width: clamp(40px, 10vw, 48px);
        height: clamp(40px, 10vw, 48px);
        border-radius: 50%;
        border: 3px solid rgba(255, 255, 255, 0.22);
        border-top-color: #1fa8dc;
        animation: videoPremiumSpin 0.75s linear infinite;
        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.15);
      }
      @keyframes videoPremiumSpin {
        to { transform: rotate(360deg); }
      }

      .video-player-root .video-seek-feedback-root {
        position: absolute !important;
        inset: 0 !important;
        width: 100% !important;
        height: 100% !important;
        z-index: 200 !important;
        pointer-events: none !important;
        box-sizing: border-box !important;
      }
      .video-seek-feedback-root .video-seek-circle {
        /* Size from the player box, not the page/iframe viewport — YouTube
           runs in a 16:9 iframe that would otherwise match "tiny landscape". */
        width: clamp(56px, 22cqmin, 88px) !important;
        height: clamp(56px, 22cqmin, 88px) !important;
        display: grid !important;
        place-items: center !important;
        position: relative !important;
        box-sizing: border-box !important;
      }
      @supports not (width: 1cqmin) {
        .video-seek-feedback-root .video-seek-circle {
          width: clamp(56px, 18cqi, 88px) !important;
          height: clamp(56px, 18cqi, 88px) !important;
        }
      }
      .video-seek-feedback-root .video-seek-icon {
        position: absolute !important;
        inset: 0 !important;
        display: grid !important;
        place-items: center !important;
        margin: 0 !important;
        padding: 0 !important;
        width: auto !important;
        height: auto !important;
        line-height: 0 !important;
        pointer-events: none !important;
        z-index: 2;
      }
      .video-seek-feedback-root .video-seek-icon svg {
        width: 44% !important;
        height: 44% !important;
        max-width: 36px;
        max-height: 36px;
        min-width: 16px;
        min-height: 16px;
        display: block !important;
        margin: 0 !important;
      }
      /* Tiny optical nudge — play tip still reads slightly left otherwise */
      .video-seek-feedback-root .video-seek-icon.is-play svg {
        transform: translateX(6%);
      }
      .video-seek-feedback-root .video-seek-icon.is-pause svg {
        transform: none;
      }
      .video-seek-feedback-root .video-seek-chevrons svg {
        width: clamp(14px, 5.5cqmin, 24px);
        height: clamp(14px, 5.5cqmin, 24px);
      }
      .video-seek-feedback-root .video-seek-label {
        font-size: clamp(0.72rem, 3.6cqmin, 0.95rem);
      }
      .video-seek-feedback-root .video-seek-side {
        top: 0;
        bottom: 0;
        gap: clamp(4px, 1.4cqmin, 8px);
        padding: 0 clamp(4px, 1.5cqi, 8px);
      }

      @media (max-width: 768px) {
        .video-player-root .custom-video-controls {
          padding: 4px 8px max(6px, env(safe-area-inset-bottom, 0px));
        }
        .video-player-root .video-progress {
          height: 4px;
          margin-bottom: 4px;
        }
        .video-player-root .video-control-buttons {
          gap: 2px;
          min-height: 28px;
        }
        .video-player-root .vc-btn {
          width: 28px;
          height: 28px;
          min-width: 28px;
          min-height: 28px;
          border-radius: 6px;
        }
        .video-player-root .vc-btn svg {
          width: 16px;
          height: 16px;
        }
        .video-player-root .vc-time {
          font-size: clamp(10px, 2.8vw, 12px);
        }
        .video-player-root .video-volume {
          width: 40px;
        }
        .video-player-root .vc-speed-btn {
          min-width: 34px;
          font-size: 10px;
        }
        .video-player-root .vc-speed-menu {
          min-width: 72px;
          padding: 4px;
        }
        .video-player-root .vc-speed-option {
          padding: 6px 8px;
          font-size: 11px;
        }
      }

      @media (max-width: 420px) {
        .video-player-root .video-volume {
          display: none;
        }
        .video-player-root .vc-time {
          font-size: 10px;
        }
      }

      @media (orientation: landscape) and (max-height: 480px) {
        .video-player-root .custom-video-controls {
          padding: 3px 8px max(4px, env(safe-area-inset-bottom, 0px));
        }
        .video-player-root .video-progress {
          height: 3px;
          margin-bottom: 3px;
        }
        .video-player-root .vc-btn {
          width: 26px;
          height: 26px;
          min-width: 26px;
          min-height: 26px;
        }
      }
    `}</style>
  );
}

function SeekChevrons({ direction }) {
  const isBack = direction === 'left';
  return (
    <div
      className="video-seek-chevrons"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        transform: isBack ? 'scaleX(-1)' : undefined,
      }}
    >
      {[0, 1, 2].map((i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          fill="currentColor"
          style={{
            marginLeft: i === 0 ? 0 : '-0.45em',
            opacity: 0.35 + i * 0.25,
            animation: `videoSeekChevronPulse 0.75s ease-out ${i * 0.06}s both`,
          }}
          aria-hidden
        >
          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
        </svg>
      ))}
    </div>
  );
}

/** Seek / play / pause flash — always a child of .video-player-root (no portal). */
export function VideoSeekFeedback({ feedback }) {
  if (!feedback) return null;

  const kind = feedback.kind || (feedback.side ? 'seek' : null);
  if (!kind) return null;

  const circleStyle = {
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.14)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    boxShadow:
      '0 10px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.14)',
    display: 'grid',
    placeItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    flexShrink: 0,
    color: '#fff',
    animation: 'videoSeekPop 0.75s cubic-bezier(0.22, 1, 0.36, 1) forwards',
    zIndex: 1,
  };

  const gloss = (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: '50%',
        background:
          'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.25), transparent 55%)',
        pointerEvents: 'none',
      }}
    />
  );

  const keyframes = (
    <style>{`
      @keyframes videoSeekPop {
        0% { opacity: 0; transform: scale(0.78); }
        18% { opacity: 1; transform: scale(1.04); }
        35% { opacity: 1; transform: scale(1); }
        70% { opacity: 1; transform: scale(1); }
        100% { opacity: 0; transform: scale(1.05); }
      }
      @keyframes videoSeekWash {
        0% { opacity: 0; }
        20% { opacity: 1; }
        70% { opacity: 1; }
        100% { opacity: 0; }
      }
      @keyframes videoSeekChevronPulse {
        0% { opacity: 0.2; transform: translateX(0) scale(0.92); }
        40% { opacity: 1; }
        100% { opacity: 0.45; }
      }
    `}</style>
  );

  // Centered play / pause — same glass circle language as seek.
  if (kind === 'play' || kind === 'pause') {
    return (
      <div
        key={feedback.id}
        aria-hidden
        className="video-seek-feedback-root is-playpause"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 200,
          userSelect: 'none',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.18) 40%, transparent 70%)',
            animation: 'videoSeekWash 0.75s ease-out forwards',
          }}
        />
        <div className="video-seek-circle" style={circleStyle}>
          {gloss}
          <span
            className={`video-seek-icon${kind === 'play' ? ' is-play' : ' is-pause'}`}
          >
            {kind === 'play' ? <IconPlay /> : <IconPause />}
          </span>
        </div>
        {keyframes}
      </div>
    );
  }

  if (kind !== 'seek' || !feedback.side) return null;

  const isLeft = feedback.side === 'left';

  return (
    <div
      key={feedback.id}
      aria-hidden
      className="video-seek-feedback-root is-seek"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 200,
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: isLeft ? 0 : '50%',
          width: '50%',
          background: isLeft
            ? 'radial-gradient(ellipse at 30% 50%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.22) 42%, transparent 72%)'
            : 'radial-gradient(ellipse at 70% 50%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.22) 42%, transparent 72%)',
          animation: 'videoSeekWash 0.75s ease-out forwards',
        }}
      />

      <div
        className="video-seek-side"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: isLeft ? 0 : '50%',
          width: '50%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'videoSeekPop 0.75s cubic-bezier(0.22, 1, 0.36, 1) forwards',
          boxSizing: 'border-box',
        }}
      >
        <div className="video-seek-circle" style={circleStyle}>
          {gloss}
          <SeekChevrons direction={isLeft ? 'left' : 'right'} />
        </div>
        <div
          className="video-seek-label"
          style={{
            color: '#fff',
            fontWeight: 600,
            letterSpacing: '0.04em',
            textShadow: '0 2px 14px rgba(0,0,0,0.75)',
            fontFamily: 'Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif',
            textAlign: 'center',
            whiteSpace: 'nowrap',
          }}
        >
          {SEEK_SECONDS} seconds
        </div>
      </div>

      {keyframes}
    </div>
  );
}
