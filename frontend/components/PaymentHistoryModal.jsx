import { useEffect, useMemo } from 'react';

function formatWhen(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      timeZone: 'Africa/Cairo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

export default function PaymentHistoryModal({ isOpen, onClose, history = [] }) {
  const rows = useMemo(
    () => (Array.isArray(history) ? history : []).slice(0, 200),
    [history]
  );

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="phm-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Payment history"
      onClick={onClose}
    >
      <div className="phm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="phm-header">
          <div className="phm-header-text">
            <h2 className="phm-title">Payment history</h2>
            <p className="phm-sub">Session balance changes with date and reason.</p>
          </div>
          <button type="button" className="phm-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="phm-list">
          {rows.length === 0 ? (
            <div className="phm-empty-wrap">
              <p className="phm-empty">No payment history yet.</p>
            </div>
          ) : (
            rows.map((row, idx) => {
              const delta = Number(row.delta) || 0;
              const sign = delta > 0 ? '+' : '';
              return (
                <div key={`${row.at}-${idx}`} className="phm-row">
                  <div className="phm-row-top">
                    <span className={`phm-delta ${delta >= 0 ? 'phm-delta--pos' : 'phm-delta--neg'}`}>
                      {sign}{delta}
                    </span>
                    <span className="phm-balance">
                      Balance: <strong>{row.balanceAfter ?? '—'}</strong>
                    </span>
                  </div>
                  <p className="phm-reason">{row.reason || row.type || 'Update'}</p>
                  <p className="phm-meta">
                    {formatWhen(row.at)}
                    {row.contentKind ? ` · ${row.contentKind}` : ''}
                    {row.lesson ? ` · ${row.lesson}` : ''}
                    {row.by ? ` · ${row.by}` : ''}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>
      <style jsx>{`
        .phm-backdrop {
          position: fixed;
          inset: 0;
          z-index: 12000;
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          box-sizing: border-box;
          animation: phm-fade-in 0.2s ease-out;
        }
        .phm-panel {
          width: min(540px, 100%);
          max-height: min(88vh, 680px);
          margin: auto;
          background: linear-gradient(165deg, #ffffff 0%, #f8fafc 100%);
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.8);
          box-shadow:
            0 28px 70px rgba(15, 23, 42, 0.22),
            0 0 0 1px rgba(15, 23, 42, 0.04);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: phm-slide-up 0.28s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .phm-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          padding: 20px 20px 16px;
          background: linear-gradient(135deg, #1b3c49 0%, #0f2833 100%);
          color: #fff;
        }
        .phm-header-text {
          min-width: 0;
          flex: 1;
        }
        .phm-title {
          margin: 0 0 6px;
          font-size: 1.22rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: #fff;
        }
        .phm-sub {
          margin: 0;
          color: rgba(255, 255, 255, 0.82);
          font-size: 0.86rem;
          line-height: 1.45;
        }
        .phm-close {
          flex-shrink: 0;
          border: none;
          background: linear-gradient(180deg, #ef4444 0%, #dc2626 100%);
          color: #fff;
          width: 40px;
          height: 40px;
          border-radius: 12px;
          cursor: pointer;
          font-size: 1.05rem;
          font-weight: 700;
          line-height: 1;
          box-shadow: 0 4px 14px rgba(220, 38, 38, 0.45);
          transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
        }
        .phm-close:hover {
          filter: brightness(1.06);
          transform: scale(1.04);
          box-shadow: 0 6px 18px rgba(220, 38, 38, 0.5);
        }
        .phm-close:active {
          transform: scale(0.98);
        }
        .phm-list {
          overflow-y: auto;
          padding: 16px 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          -webkit-overflow-scrolling: touch;
        }
        .phm-row {
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 14px 16px;
          background: #fff;
          box-shadow: 0 2px 10px rgba(15, 23, 42, 0.05);
          transition: box-shadow 0.15s ease, border-color 0.15s ease;
        }
        .phm-row:hover {
          border-color: #cbd5e1;
          box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
        }
        .phm-row-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .phm-delta {
          font-weight: 800;
          font-size: 1.08rem;
          letter-spacing: -0.02em;
        }
        .phm-delta--pos {
          color: #15803d;
        }
        .phm-delta--neg {
          color: #b91c1c;
        }
        .phm-balance {
          font-size: 0.84rem;
          color: #64748b;
          font-weight: 600;
        }
        .phm-balance strong {
          color: #1e293b;
          font-weight: 800;
        }
        .phm-reason {
          margin: 10px 0 6px;
          font-size: 0.94rem;
          color: #0f172a;
          line-height: 1.45;
          font-weight: 500;
        }
        .phm-meta {
          margin: 0;
          font-size: 0.78rem;
          color: #94a3b8;
        }
        .phm-empty-wrap {
          padding: 32px 16px;
          text-align: center;
        }
        .phm-empty {
          margin: 0;
          color: #94a3b8;
          font-size: 0.95rem;
        }
        @keyframes phm-fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes phm-slide-up {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @media (max-width: 480px) {
          .phm-backdrop {
            padding: 12px;
            align-items: center;
            justify-content: center;
          }
          .phm-panel {
            max-height: min(88vh, 680px);
            border-radius: 20px;
            margin: auto;
          }
          .phm-header {
            padding: 16px 16px 14px;
          }
          .phm-close {
            width: 44px;
            height: 44px;
          }
        }
      `}</style>
    </div>
  );
}
