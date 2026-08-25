import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { ANALYTICS_CATEGORY_META } from '../lib/onlineAnalytics';
import AnalyticsStudentsTable from './AnalyticsStudentsTable';

export default function AnalyticsModal({
  open,
  onClose,
  title,
  subtitle,
  analyticsData,
  analyticsLoading,
  ChartComponent,
}) {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const analytics = analyticsData?.analytics;
  const students = analytics?.students || [];

  const clearSelection = () => setSelectedCategory(null);

  useEffect(() => {
    if (open) setSelectedCategory(null);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const filteredStudents = useMemo(() => {
    const list = !selectedCategory || selectedCategory === 'totalStudents'
      ? students
      : students.filter((student) => student.category === selectedCategory);
    return [...list].sort((a, b) => {
      const idA = Number(a.id);
      const idB = Number(b.id);
      if (!Number.isNaN(idA) && !Number.isNaN(idB)) return idA - idB;
      return String(a.id).localeCompare(String(b.id));
    });
  }, [students, selectedCategory]);

  const selectedMeta = ANALYTICS_CATEGORY_META.find((item) => item.key === selectedCategory);

  if (!open) return null;

  return (
    <div
      className="analytics-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="analytics-modal-content"
        onClick={(e) => {
          e.stopPropagation();
          clearSelection();
        }}
      >
        <button
          className="analytics-close-btn"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Close"
        >
          <Image src="/close-cross.svg" alt="Close" width={35} height={35} />
        </button>

        <div className="analytics-header">
          <h2>
            <Image src="/chart2.svg" alt="Analytics" width={32} height={32} />
            {title}
          </h2>
          {subtitle ? <p className="analytics-subtitle">{subtitle}</p> : null}
          <p className="analytics-hint">Tap a bar or an indicator to filter. Tap elsewhere to clear.</p>
        </div>

        {analyticsLoading ? (
          <div className="analytics-loading">
            <div className="analytics-spinner" />
            <p>Loading analytics...</p>
          </div>
        ) : analytics ? (
          <>
            <div
              className="analytics-chart-wrap"
              onClick={(e) => {
                const isBar = e.target.closest?.('.recharts-bar-rectangle, .recharts-rectangle, .recharts-bar');
                if (isBar) e.stopPropagation();
              }}
            >
              <ChartComponent
                analyticsData={analytics}
                onBarClick={setSelectedCategory}
                selectedCategory={selectedCategory}
              />
            </div>

            <div className="analytics-stats-grid">
              {ANALYTICS_CATEGORY_META.map((item) => {
                const isSelected = selectedCategory === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`analytics-stat-item${isSelected ? ' selected' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCategory(item.key);
                    }}
                    style={{ '--stat-color': item.color }}
                  >
                    <div className="analytics-stat-value" style={{ color: item.color }}>
                      {analytics[item.key] ?? 0}
                    </div>
                    <div className="analytics-stat-label">{item.label}</div>
                  </button>
                );
              })}
            </div>

            <div onClick={(e) => e.stopPropagation()}>
              <AnalyticsStudentsTable
                students={filteredStudents}
                categoryLabel={selectedMeta?.label || 'All Students'}
              />
            </div>
          </>
        ) : (
          <div className="analytics-empty">No analytics data available</div>
        )}
      </div>

      <style jsx>{`
        .analytics-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: fadeIn 0.3s ease;
          padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
          box-sizing: border-box;
        }
        .analytics-modal-content {
          position: relative;
          background: #fff;
          border-radius: 20px;
          padding: 40px;
          max-width: 1000px;
          width: 100%;
          min-width: 0;
          max-height: min(90vh, calc(100dvh - 24px));
          overflow: auto;
          -webkit-overflow-scrolling: touch;
          animation: slideUp 0.3s ease;
          z-index: 10000;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          box-sizing: border-box;
        }
        .analytics-header h2 {
          margin: 0 0 10px;
          font-size: clamp(1.15rem, 4vw, 2rem);
          font-weight: 700;
          color: #1FA8DC;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          flex-wrap: wrap;
          word-break: break-word;
        }
        .analytics-subtitle {
          margin: 0 0 8px;
          color: #6c757d;
          font-size: clamp(0.8rem, 2.8vw, 1rem);
          font-weight: 500;
          overflow-wrap: anywhere;
        }
        .analytics-close-btn {
          position: absolute;
          top: 20px;
          right: 20px;
          z-index: 3;
          border: none;
          background: transparent;
          cursor: pointer;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          padding: 0;
          transition: transform 0.2s ease;
          -webkit-tap-highlight-color: transparent;
        }
        .analytics-close-btn:hover {
          transform: scale(1.1);
        }
        .analytics-header {
          text-align: center;
          margin: 0 40px 16px;
          padding-bottom: 16px;
          border-bottom: 2px solid #e9ecef;
        }
        .analytics-hint {
          margin: 0;
          color: #868e96;
          font-size: 0.85rem;
        }
        .analytics-chart-wrap {
          margin-bottom: 0;
          min-width: 0;
        }
        .analytics-stats-grid {
          padding: 18px;
          background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
          border-radius: 16px;
          display: flex;
          flex-direction: row;
          gap: 12px;
          flex-wrap: wrap;
          justify-content: center;
        }
        .analytics-stat-item {
          text-align: center;
          padding: 14px 12px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          border: 2px solid transparent;
          cursor: pointer;
          min-width: 110px;
          flex: 1 1 140px;
          max-width: 200px;
          font-family: inherit;
          appearance: none;
          -webkit-appearance: none;
          -webkit-tap-highlight-color: transparent;
          transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
        }
        .analytics-stat-item:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
        }
        .analytics-stat-item.selected {
          border-color: var(--stat-color);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12), 0 0 0 3px rgba(31, 168, 220, 0.18);
        }
        .analytics-stat-value {
          font-size: 1.8rem;
          font-weight: 700;
          margin-bottom: 6px;
          line-height: 1;
        }
        .analytics-stat-label {
          font-size: 0.8rem;
          color: #6c757d;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }
        .analytics-loading,
        .analytics-empty {
          text-align: center;
          padding: 60px 20px;
          color: #6c757d;
        }
        .analytics-spinner {
          width: 50px;
          height: 50px;
          border: 4px solid rgba(31, 168, 220, 0.2);
          border-top: 4px solid #1FA8DC;
          border-radius: 50%;
          margin: 0 auto 20px;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @media (hover: none) {
          .analytics-stat-item:hover,
          .analytics-close-btn:hover {
            transform: none;
          }
        }
        @media (max-width: 768px) {
          .analytics-modal-overlay {
            padding: max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left));
            align-items: flex-start;
          }
          .analytics-modal-content {
            padding: 28px 14px 18px;
            border-radius: 16px;
            max-height: calc(100dvh - 16px);
            margin: auto 0;
          }
          .analytics-close-btn {
            top: 10px;
            right: 10px;
            width: 32px;
            height: 32px;
          }
          .analytics-header {
            margin: 0 32px 12px 4px;
            padding-bottom: 12px;
          }
          .analytics-hint {
            font-size: 0.75rem;
          }
          .analytics-stats-grid {
            gap: 8px;
            padding: 10px;
          }
          .analytics-stat-item {
            flex: 1 1 calc(50% - 8px);
            min-width: calc(50% - 8px);
            max-width: calc(50% - 8px);
            padding: 10px 6px;
          }
          .analytics-stat-value {
            font-size: 1.35rem;
          }
          .analytics-stat-label {
            font-size: 0.68rem;
            letter-spacing: 0.2px;
          }
        }
        @media (max-width: 480px) {
          .analytics-modal-overlay {
            padding: max(4px, env(safe-area-inset-top)) 4px max(4px, env(safe-area-inset-bottom));
          }
          .analytics-modal-content {
            padding: 22px 10px 14px;
            border-radius: 12px;
            max-height: calc(100dvh - 8px);
          }
          .analytics-close-btn {
            top: 6px;
            right: 6px;
            width: 28px;
            height: 28px;
          }
          .analytics-header {
            margin: 0 28px 10px 0;
          }
          .analytics-stat-item {
            min-width: calc(50% - 8px);
          }
        }
        @media (max-width: 360px) {
          .analytics-stat-label {
            font-size: 0.62rem;
          }
          .analytics-stat-value {
            font-size: 1.2rem;
          }
        }
        @media (max-height: 500px) and (orientation: landscape) {
          .analytics-modal-overlay {
            align-items: stretch;
            padding: 6px;
          }
          .analytics-modal-content {
            max-height: calc(100dvh - 12px);
            padding: 16px 12px 12px;
          }
          .analytics-header {
            margin-bottom: 8px;
            padding-bottom: 8px;
          }
        }
      `}</style>
    </div>
  );
}
