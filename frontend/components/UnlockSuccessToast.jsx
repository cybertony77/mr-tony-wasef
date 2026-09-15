import { useEffect } from 'react';

/** Lightweight success toast for unlock flows (no browser alert). */
export default function UnlockSuccessToast({
  open,
  title,
  message,
  onClose,
  durationMs = 2800,
  /** When true, leave room so the toast sits under a video modal instead of on controls */
  aboveVideo = false,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => onClose?.(), durationMs);
    return () => clearTimeout(t);
  }, [open, durationMs, onClose]);

  if (!open) return null;

  return (
    <div
      className={`ust-wrap${aboveVideo ? ' ust-wrap--above-video' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="ust-card">
        <div className="ust-icon" aria-hidden="true">
          ✓
        </div>
        <div className="ust-body">
          <p className="ust-title">{title || 'Video unlocked'}</p>
          {message ? <p className="ust-msg">{message}</p> : null}
        </div>
      </div>
      <style jsx>{`
        .ust-wrap {
          position: fixed;
          left: 50%;
          right: auto;
          top: auto;
          bottom: max(16px, calc(10px + env(safe-area-inset-bottom, 0px)));
          transform: translateX(-50%);
          z-index: 14000;
          width: min(360px, calc(100vw - 24px));
          max-width: calc(100% - 24px);
          animation: ust-in 0.28s ease-out;
          pointer-events: none;
          box-sizing: border-box;
          padding-left: env(safe-area-inset-left, 0px);
          padding-right: env(safe-area-inset-right, 0px);
        }
        .ust-wrap--above-video {
          /* Sit in the clear band under the lifted video player */
          bottom: max(12px, calc(8px + env(safe-area-inset-bottom, 0px)));
        }
        .ust-card {
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: flex-start;
          text-align: left;
          gap: 12px;
          background: linear-gradient(160deg, #1a4058 0%, #122f42 100%);
          color: #fff;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 14px;
          padding: 12px 14px;
          box-shadow:
            0 14px 36px rgba(15, 23, 42, 0.3),
            0 0 0 1px rgba(15, 23, 42, 0.08);
          box-sizing: border-box;
        }
        .ust-icon {
          width: 32px;
          height: 32px;
          border-radius: 999px;
          background: #22c55e;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.95rem;
          font-weight: 800;
          line-height: 1;
          flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(34, 197, 94, 0.35);
        }
        .ust-body {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          text-align: left;
        }
        .ust-title {
          margin: 0;
          font-size: clamp(0.88rem, 2.6vw, 0.98rem);
          font-weight: 750;
          letter-spacing: 0.01em;
          line-height: 1.25;
          word-break: break-word;
        }
        .ust-msg {
          margin: 3px 0 0;
          font-size: clamp(0.75rem, 2.3vw, 0.84rem);
          opacity: 0.9;
          line-height: 1.35;
          max-width: 100%;
          word-break: break-word;
        }
        @keyframes ust-in {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(10px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0) scale(1);
          }
        }
        @media (max-width: 480px) {
          .ust-wrap {
            width: calc(100vw - 16px);
            bottom: max(12px, calc(8px + env(safe-area-inset-bottom, 0px)));
          }
          .ust-card {
            padding: 10px 12px;
            gap: 10px;
            border-radius: 12px;
          }
          .ust-icon {
            width: 28px;
            height: 28px;
            font-size: 0.85rem;
          }
        }
        @media (max-height: 520px) {
          .ust-wrap {
            bottom: max(8px, env(safe-area-inset-bottom, 0px));
          }
          .ust-card {
            padding: 8px 10px;
            gap: 8px;
          }
          .ust-msg {
            margin-top: 2px;
          }
        }
      `}</style>
    </div>
  );
}
