import { useEffect, useState } from 'react';
import Image from 'next/image';
import R2VideoPlayer from './R2VideoPlayer';
import ZoomVideoPlayer from './ZoomVideoPlayer';
import GoogleMeetVideoPlayer from './GoogleMeetVideoPlayer';
import YoutubeEmbedWithProgress from './YoutubeEmbedWithProgress';
import { normalizeStoredExplanationVideo } from '../lib/explanationVideo';

/**
 * Compact "Video" button + full-screen-ish player modal (recorded-sessions style).
 */
export default function ExplanationVideoWatchButton({
  video,
  label = 'Video',
  watermarkText = '',
  buttonStyle = {},
}) {
  const [open, setOpen] = useState(false);
  const normalized = normalizeStoredExplanationVideo(video);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!normalized) return null;

  const title = normalized.video_name || label;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '10px 16px',
          minHeight: 42,
          border: 'none',
          borderRadius: 10,
          background: 'linear-gradient(135deg, #1FA8DC 0%, #0ea5e9 100%)',
          color: '#fff',
          fontWeight: 700,
          fontSize: 'clamp(0.85rem, 3.5vw, 0.95rem)',
          cursor: 'pointer',
          boxShadow: '0 6px 16px rgba(31, 168, 220, 0.28)',
          whiteSpace: 'normal',
          textAlign: 'center',
          flexShrink: 0,
          maxWidth: '100%',
          boxSizing: 'border-box',
          ...buttonStyle,
        }}
      >
        <Image src="/play.svg" alt="" width={16} height={16} style={{ filter: 'brightness(0) invert(1)' }} />
        {label}
      </button>

      {open ? (
        <div
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 14000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 12,
            background: 'rgba(0,0,0,0.82)',
            backdropFilter: 'blur(6px)',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: 'min(960px, 100%)',
              maxHeight: '92vh',
              overflow: 'auto',
              borderRadius: 16,
              background: '#111',
              boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '14px 16px',
                background: '#1a1a1a',
                color: '#fff',
                borderBottom: '1px solid #333',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>{title}</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  padding: 4,
                }}
              >
                <Image src="/close-cross.svg" alt="" width={28} height={28} />
              </button>
            </div>

            <div
              style={{
                position: 'relative',
                width: '100%',
                background: '#000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 220,
              }}
              onContextMenu={(e) => e.preventDefault()}
            >
              {normalized.video_type === 'r2' ? (
                <R2VideoPlayer
                  r2Key={normalized.video_id}
                  videoId={`explanation-${normalized.video_id}`}
                  watermarkText={watermarkText || 'student'}
                />
              ) : normalized.video_type === 'zoom' ? (
                <ZoomVideoPlayer
                  meetingId={normalized.video_id}
                  videoId={`explanation-zoom-${normalized.video_id}`}
                  watermarkText={watermarkText || 'student'}
                />
              ) : normalized.video_type === 'google_meet' ? (
                <GoogleMeetVideoPlayer
                  secureId={normalized.video_id}
                  videoId={`explanation-meet-${normalized.video_id}`}
                  watermarkText={watermarkText || 'student'}
                />
              ) : (
                <YoutubeEmbedWithProgress
                  youtubeVideoId={normalized.video_id}
                  watermarkText={watermarkText || 'student'}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Explanation box: text on left, video button vertically centered on the right */
export function QuestionExplanationDisplay({
  text,
  video,
  watermarkText = '',
}) {
  const hasText = String(text || '').trim() !== '';
  const hasVideo = Boolean(normalizeStoredExplanationVideo(video));
  if (!hasText && !hasVideo) return null;

  return (
    <div
      style={{
        marginTop: 16,
        padding: '12px 16px',
        backgroundColor: '#e7f3ff',
        border: '2px solid #1FA8DC',
        borderRadius: 8,
        fontSize: '0.95rem',
        color: '#004085',
        lineHeight: 1.6,
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: '100%',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: '#1FA8DC', marginBottom: hasText ? 8 : 0 }}>
          💡 Explanation:
        </div>
        {hasText ? (
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
            {text}
          </div>
        ) : null}
      </div>
      {hasVideo ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: '0 0 auto',
            alignSelf: 'center',
          }}
        >
          <ExplanationVideoWatchButton
            video={video}
            label="Video"
            watermarkText={watermarkText}
          />
        </div>
      ) : null}
    </div>
  );
}
