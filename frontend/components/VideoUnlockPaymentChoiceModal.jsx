import { useEffect, useState } from 'react';

/**
 * Premium unlock flow for paid recorded / homework videos:
 * 1) Choose Session Credit vs VVC/VHC
 * 2) Confirm before deducting (session credit only)
 *
 * Deduction happens only via onConfirmSession (parent → backend).
 */
export default function VideoUnlockPaymentChoiceModal({
  isOpen,
  onClose,
  onConfirmSession,
  onUseCode,
  codeLabel = 'Use VVC Code',
  sessionsAvailable = 0,
  paymentState = '',
  loading = false,
}) {
  const [step, setStep] = useState('choice'); // 'choice' | 'confirm'
  const [error, setError] = useState('');
  const [balanceError, setBalanceError] = useState('');
  const sessionsCount = Math.max(0, Number(sessionsAvailable) || 0);
  const hasCredits = sessionsCount > 0;
  const isFreePaymentState =
    paymentState === 'free' || String(paymentState || '').startsWith('free_');
  const freeSuffix = isFreePaymentState ? ' (free)' : '';

  useEffect(() => {
    if (!isOpen) {
      setStep('choice');
      setError('');
      setBalanceError('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!balanceError) return undefined;
    const timer = setTimeout(() => setBalanceError(''), 6000);
    return () => clearTimeout(timer);
  }, [balanceError]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget && !loading) onClose();
  };

  const goConfirm = () => {
    if (loading) return;
    if (!hasCredits) {
      setBalanceError(
        'Your session balance is 0. Please renew your sessions to open this video, or use a verification code.'
      );
      return;
    }
    setBalanceError('');
    setError('');
    setStep('confirm');
  };

  const handleConfirm = async () => {
    if (loading || !hasCredits) return;
    setError('');
    try {
      await onConfirmSession();
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.message ||
        'Could not unlock this video. Please try again.';
      setError(msg);
    }
  };

  return (
    <div className="vum-backdrop" role="dialog" aria-modal="true" onClick={handleBackdrop}>
      <div className="vum-panel" onClick={(e) => e.stopPropagation()}>
        {step === 'choice' ? (
          <>
            <h2 className="vum-title">Unlock Video</h2>
            <p className="vum-sub">
              Choose how you&apos;d like to access this recorded session.
            </p>

            <div className="vum-options">
              <button
                type="button"
                className={`vum-card vum-card--primary ${!hasCredits ? 'vum-card--zero' : ''}`}
                disabled={loading}
                onClick={goConfirm}
              >
                <span className="vum-card-icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M10 8.5l6 3.5-6 3.5V8.5z" fill="currentColor" />
                  </svg>
                </span>
                <span className="vum-card-body">
                  <span className="vum-card-title">Use Session Credit{freeSuffix}</span>
                  <span className="vum-card-desc">
                    Use 1 session credit to watch this video once.
                  </span>
                  <span className="vum-card-meta">1 credit · 1 view</span>
                </span>
              </button>

              <button
                type="button"
                className="vum-card vum-card--secondary"
                disabled={loading}
                onClick={onUseCode}
              >
                <span className="vum-card-icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M7 11V8a5 5 0 0110 0v3"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                    <rect
                      x="5"
                      y="11"
                      width="14"
                      height="10"
                      rx="2"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    />
                    <circle cx="12" cy="16" r="1.2" fill="currentColor" />
                  </svg>
                </span>
                <span className="vum-card-body">
                  <span className="vum-card-title">{codeLabel}</span>
                  <span className="vum-card-desc">
                    Have a {codeLabel.includes('VHC') ? 'VHC' : 'VVC'} code? Use it to unlock this
                    video.
                  </span>
                </span>
              </button>
            </div>

            {balanceError ? (
              <p className="vum-balance-error" role="alert">
                {balanceError}
              </p>
            ) : null}

            <button type="button" className="vum-cancel" onClick={onClose} disabled={loading}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <h2 className="vum-title">Use Session Credit?</h2>
            <p className="vum-sub">
              You&apos;re about to use 1 session credit to access this video.
            </p>

            <div className="vum-balance-box">
              <span className="vum-balance-label">Sessions remaining in your account :</span>
              <span className="vum-balance-value-wrap">
                <span className="vum-balance-value">{sessionsCount}</span>
              </span>
            </div>

            <div className="vum-stats">
              <div className="vum-stat">
                <span className="vum-stat-value">1</span>
                <span className="vum-stat-label">Session Credit</span>
                <span className="vum-stat-hint">Will be deducted</span>
              </div>
              <div className="vum-stat">
                <span className="vum-stat-value">1</span>
                <span className="vum-stat-label">View</span>
                <span className="vum-stat-hint">Video access</span>
              </div>
            </div>

            <div className="vum-explain">
              <p>1 session credit will be deducted from your available number of sessions.</p>
              <p>This video will be opened for 1 view only.</p>
            </div>

            {error ? <p className="vum-error" role="alert">{error}</p> : null}

            <button
              type="button"
              className="vum-confirm"
              disabled={loading || !hasCredits}
              onClick={handleConfirm}
            >
              {loading ? 'Unlocking…' : `Confirm & Watch${freeSuffix}`}
            </button>
            <button
              type="button"
              className="vum-cancel"
              onClick={() => {
                if (loading) return;
                setError('');
                setStep('choice');
              }}
              disabled={loading}
            >
              Cancel
            </button>
          </>
        )}
      </div>

      <style jsx>{`
        .vum-backdrop {
          position: fixed;
          inset: 0;
          z-index: 11500;
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          padding-bottom: max(16px, env(safe-area-inset-bottom));
          box-sizing: border-box;
          animation: vum-fade 0.18s ease-out;
        }
        .vum-panel {
          width: min(460px, calc(100% - 32px));
          max-height: min(90vh, 720px);
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          margin: auto;
          background: #fff;
          border-radius: 20px;
          border: 1px solid #e8eef5;
          box-shadow: 0 24px 56px rgba(15, 23, 42, 0.2);
          padding: 24px 22px 18px;
          text-align: center;
          animation: vum-up 0.22s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .vum-title {
          margin: 0 0 8px;
          font-size: 1.28rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: #16364a;
        }
        .vum-sub {
          margin: 0 0 20px;
          color: #64748b;
          font-size: 0.92rem;
          line-height: 1.5;
        }
        .vum-options {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .vum-card {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          text-align: left;
          width: 100%;
          padding: 16px 14px;
          border-radius: 14px;
          cursor: pointer;
          transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
          font: inherit;
        }
        .vum-card:disabled {
          cursor: not-allowed;
        }
        .vum-card--primary {
          background: linear-gradient(145deg, #f0f9fc 0%, #e8f6fb 100%);
          border: 1.5px solid #1fa8dc;
          box-shadow: 0 4px 14px rgba(31, 168, 220, 0.12);
        }
        .vum-card--primary:not(:disabled):hover {
          box-shadow: 0 6px 18px rgba(31, 168, 220, 0.2);
        }
        .vum-card--secondary {
          background: #fff;
          border: 1.5px solid #e2e8f0;
        }
        .vum-card--secondary:not(:disabled):hover {
          border-color: #cbd5e1;
          background: #f8fafc;
        }
        .vum-card--disabled {
          background: #f1f5f9;
          border-color: #e2e8f0;
          box-shadow: none;
          opacity: 0.85;
        }
        .vum-card--zero:not(:disabled):hover {
          box-shadow: 0 4px 14px rgba(31, 168, 220, 0.12);
        }
        .vum-balance-error {
          margin: 14px 0 0;
          padding: 12px 14px;
          border-radius: 12px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #b91c1c;
          font-size: 0.88rem;
          line-height: 1.45;
          text-align: left;
          font-weight: 600;
          animation: vum-fade 0.2s ease-out;
        }
        .vum-card--disabled .vum-card-title {
          color: #64748b;
        }
        .vum-card--disabled .vum-card-desc {
          color: #94a3b8;
        }
        .vum-card-icon {
          flex-shrink: 0;
          width: 42px;
          height: 42px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #fff;
          color: #1fa8dc;
          border: 1px solid #d7ebf5;
        }
        .vum-card--secondary .vum-card-icon {
          color: #475569;
          border-color: #e2e8f0;
          background: #f8fafc;
        }
        .vum-card--disabled .vum-card-icon {
          color: #94a3b8;
          border-color: #e2e8f0;
        }
        .vum-card-body {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }
        .vum-card-title {
          font-size: 1rem;
          font-weight: 750;
          color: #16364a;
        }
        .vum-card-desc {
          font-size: 0.86rem;
          color: #64748b;
          line-height: 1.4;
        }
        .vum-card-meta {
          margin-top: 4px;
          font-size: 0.75rem;
          font-weight: 700;
          color: #0d8ab8;
          letter-spacing: 0.02em;
        }
        .vum-stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-bottom: 16px;
        }
        .vum-balance-box {
          display: flex;
          align-items: center;
          justify-content: space-around;
          gap: 0;
          margin-bottom: 14px;
          padding: 12px 14px;
          border-radius: 12px;
          background: linear-gradient(145deg, #f0f9fc 0%, #e8f6fb 100%);
          border: 1.5px solid #b6e0f0;
          text-align: left;
        }
        .vum-balance-label {
          flex-shrink: 0;
          font-size: 0.86rem;
          font-weight: 650;
          color: #475569;
          line-height: 1.35;
        }
        .vum-balance-value-wrap {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 0;
        }
        .vum-balance-value {
          flex-shrink: 0;
          font-size: 1.45rem;
          font-weight: 800;
          color: #0d8ab8;
          line-height: 1;
        }
        .vum-stat {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 14px 10px;
        }
        .vum-stat-value {
          display: block;
          font-size: 1.55rem;
          font-weight: 800;
          color: #1fa8dc;
          line-height: 1.1;
        }
        .vum-stat-label {
          display: block;
          margin-top: 4px;
          font-size: 0.82rem;
          font-weight: 700;
          color: #16364a;
        }
        .vum-stat-hint {
          display: block;
          margin-top: 2px;
          font-size: 0.75rem;
          color: #64748b;
        }
        .vum-explain {
          text-align: left;
          background: #f8fafc;
          border-radius: 12px;
          border: 1px solid #eef2f7;
          padding: 12px 14px;
          margin-bottom: 16px;
        }
        .vum-explain p {
          margin: 0 0 6px;
          font-size: 0.86rem;
          color: #475569;
          line-height: 1.45;
        }
        .vum-explain p:last-child {
          margin-bottom: 0;
        }
        .vum-error {
          margin: 0 0 12px;
          padding: 10px 12px;
          border-radius: 10px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #b91c1c;
          font-size: 0.86rem;
          line-height: 1.4;
          text-align: left;
        }
        .vum-confirm {
          width: 100%;
          border: none;
          border-radius: 12px;
          padding: 14px 16px;
          min-height: 48px;
          font-size: 0.98rem;
          font-weight: 750;
          cursor: pointer;
          color: #fff;
          background: linear-gradient(135deg, #1fa8dc 0%, #0d8ab8 100%);
          box-shadow: 0 6px 18px rgba(31, 168, 220, 0.28);
          transition: filter 0.15s ease, opacity 0.15s ease;
        }
        .vum-confirm:disabled {
          opacity: 0.65;
          cursor: not-allowed;
          box-shadow: none;
        }
        .vum-confirm:not(:disabled):hover {
          filter: brightness(1.04);
        }
        .vum-cancel {
          margin-top: 12px;
          width: 100%;
          min-height: 46px;
          padding: 12px 16px;
          border-radius: 12px;
          border: 1.5px solid #fecaca;
          background: linear-gradient(180deg, #fff5f5 0%, #fff 100%);
          color: #dc2626;
          font-size: 0.95rem;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease, filter 0.15s ease;
        }
        .vum-cancel:hover:not(:disabled) {
          background: #fef2f2;
          border-color: #f87171;
        }
        .vum-cancel:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        @keyframes vum-fade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes vum-up {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @media (max-width: 480px) {
          .vum-backdrop {
            padding: 12px;
            align-items: center;
          }
          .vum-panel {
            width: calc(100% - 24px);
            padding: 20px 16px 14px;
            border-radius: 18px;
          }
          .vum-title {
            font-size: 1.15rem;
          }
          .vum-stats {
            grid-template-columns: 1fr;
          }
          .vum-card {
            padding: 14px 12px;
          }
        }
      `}</style>
    </div>
  );
}
