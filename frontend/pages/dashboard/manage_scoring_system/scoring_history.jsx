import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TextInput, ActionIcon, useMantineTheme } from '@mantine/core';
import { IconSearch, IconArrowRight, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import Image from 'next/image';
import apiClient from '../../../lib/axios';
import { useProfile } from '../../../lib/api/auth';
import Title from '../../../components/Title';

function formatTimestamp(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d)) return String(ts);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).replace(',', '');
}

const TYPE_META = {
  attendance: {
    label: 'Attendance',
    accent: '#0ea5e9',
    accentSoft: 'rgba(14, 165, 233, 0.12)',
    icon: '📅',
    gradient: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)',
  },
  homework: {
    label: 'Homework',
    accent: '#f59e0b',
    accentSoft: 'rgba(245, 158, 11, 0.12)',
    icon: '📝',
    gradient: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)',
  },
  quiz: {
    label: 'Quiz',
    accent: '#22c55e',
    accentSoft: 'rgba(34, 197, 94, 0.12)',
    icon: '✏️',
    gradient: 'linear-gradient(135deg, #4ade80 0%, #16a34a 100%)',
  },
  mock_exam: {
    label: 'Mock Exam',
    accent: '#a855f7',
    accentSoft: 'rgba(168, 85, 247, 0.12)',
    icon: '📋',
    gradient: 'linear-gradient(135deg, #c084fc 0%, #7c3aed 100%)',
  },
  manual: {
    label: 'Staff Score',
    accent: '#0f172a',
    accentSoft: 'rgba(15, 23, 42, 0.08)',
    icon: '⭐',
    gradient: 'linear-gradient(135deg, #334155 0%, #0f172a 100%)',
  },
};

function getMeta(type) {
  return TYPE_META[type] || {
    label: type ?? '—',
    accent: '#64748b',
    accentSoft: 'rgba(100, 116, 139, 0.12)',
    icon: '⭐',
    gradient: 'linear-gradient(135deg, #94a3b8 0%, #475569 100%)',
  };
}

function badge(val) {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  const pos = n > 0;
  const zero = n === 0;
  return {
    n,
    label: `${pos ? '+' : ''}${n}`,
    bg: zero ? '#f8fafc' : pos ? '#ecfdf3' : '#fef2f2',
    color: zero ? '#64748b' : pos ? '#15803d' : '#dc2626',
    border: zero ? '#e2e8f0' : pos ? '#bbf7d0' : '#fecaca',
  };
}

function buildReason(entry) {
  const { type, process_name, data: d, score_added, bonus_points, process_lesson } = entry;
  const net = Number(score_added ?? entry.applied_delta ?? 0);
  const bonus = Number(bonus_points ?? 0);
  const previousAwarded = entry.previous_awarded_contribution;
  const currentContribution = entry.desired_total_points ?? entry.base_points;
  const lessonSuffix = process_lesson ? ` for lesson "${process_lesson}"` : '';

  if (type === 'attendance') {
    if (d?.reverseOnly) {
      return `Attendance was reversed${lessonSuffix}. The points actually awarded for the previous attendance were removed.`;
    }
    const status = d?.status ?? 'attend';
    return `Student was marked as "${status}"${lessonSuffix}. Score updated according to the attendance rule.`;
  }

  if (type === 'homework') {
    const withDegree = process_name?.includes('with degree');
    if (d?.reverseOnly) {
      return `Homework score was reversed${lessonSuffix}. The previously awarded contribution was removed.`;
    }
    if (withDegree) {
      const pct = d?.percentage ?? 0;
      const base = `Student scored ${pct}% on the homework${lessonSuffix}.`;
      if (previousAwarded !== undefined && previousAwarded !== null && Number(previousAwarded) !== 0) {
        return `${base} Previous awarded contribution was ${previousAwarded > 0 ? '+' : ''}${previousAwarded} pts; current contribution is ${currentContribution > 0 ? '+' : ''}${currentContribution} pts. Net change: ${net > 0 ? '+' : ''}${net}.${bonus !== 0 ? ` Streak bonus: ${bonus > 0 ? '+' : ''}${bonus} pts.` : ''}`;
      }
      return `${base} First scoring for this item — full rule points were applied.${bonus !== 0 ? ` Streak bonus: ${bonus > 0 ? '+' : ''}${bonus} pts.` : ''}`;
    }
    const done = d?.hwDone;
    const label = done === true ? 'Done' : done === false ? 'Not Done' : String(done ?? '—');
    return `Homework completion status set to "${label}"${lessonSuffix}. Score updated per the without-degree rule.`;
  }

  if (type === 'quiz' || type === 'mock_exam') {
    const typeName = type === 'quiz' ? 'Quiz' : 'Mock Exam';
    if (d?.reverseOnly) {
      return `${typeName} score was reversed${lessonSuffix}. The previously awarded contribution was removed.`;
    }
    const pct = d?.percentage ?? 0;
    if (pct === 0) {
      return `Student did not attempt the ${typeName.toLowerCase()}${lessonSuffix}. A penalty was applied per the 0% rule.`;
    }
    const base = `Student scored ${pct}% on the ${typeName.toLowerCase()}${lessonSuffix}.`;
    if (previousAwarded !== undefined && previousAwarded !== null && Number(previousAwarded) !== 0) {
      return `${base} Previous awarded contribution was ${previousAwarded > 0 ? '+' : ''}${previousAwarded} pts. Net change: ${net > 0 ? '+' : ''}${net}.${bonus !== 0 ? ` Streak bonus: ${bonus > 0 ? '+' : ''}${bonus} pts.` : ''}`;
    }
    return `${base} First scoring for this item — full rule points applied.${bonus !== 0 ? ` Streak bonus: ${bonus > 0 ? '+' : ''}${bonus} pts.` : ''}`;
  }

  if (type === 'manual') {
    const delta = Number(d?.delta ?? net);
    return `Staff changed this student's score from Manage Student Score by ${delta >= 0 ? '+' : ''}${delta} points.`;
  }

  return `Score changed by ${net > 0 ? '+' : ''}${net} points.`;
}

function SearchBar({ value, onChange, onSearch }) {
  const theme = useMantineTheme();
  return (
    <TextInput
      radius="xl"
      size="md"
      placeholder="Search by Student ID"
      value={value}
      onChange={(e) => onChange(e.currentTarget.value.replace(/\D/g, ''))}
      onKeyDown={(e) => { if (e.key === 'Enter') onSearch(); }}
      leftSection={<IconSearch size={18} stroke={1.5} />}
      rightSectionWidth={42}
      rightSection={
        <ActionIcon
          size={32}
          radius="xl"
          color={theme.primaryColor}
          variant="filled"
          onClick={onSearch}
          aria-label="Search"
          style={{ cursor: 'pointer' }}
        >
          <IconArrowRight size={18} stroke={1.5} />
        </ActionIcon>
      }
      styles={{
        root: { width: '100%', flex: 1 },
        input: {
          background: 'white',
          border: '1px solid rgba(255,255,255,0.7)',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
          fontWeight: 500,
        },
      }}
    />
  );
}

function StatChip({ label, value, bg, color, border, dark }) {
  return (
    <div
      className="sh-stat"
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 14,
        padding: '12px 10px',
        textAlign: 'center',
        minWidth: 0,
      }}
    >
      <div style={{
        fontSize: '0.68rem',
        color: dark ? 'rgba(255,255,255,0.72)' : '#64748b',
        textTransform: 'uppercase',
        letterSpacing: 0.7,
        marginBottom: 6,
        fontWeight: 700,
      }}>
        {label}
      </div>
      <div style={{ fontWeight: 800, color, fontSize: '1.2rem', lineHeight: 1.1, wordBreak: 'break-word' }}>
        {value}
      </div>
    </div>
  );
}

function HistoryCard({ entry }) {
  const meta = getMeta(entry.type);
  const netB = badge(entry.score_added ?? entry.applied_delta);
  const bonusB = badge(entry.bonus_points);
  const showBonus = bonusB && bonusB.n !== 0;
  const reason = buildReason(entry);

  return (
    <article className="sh-card">
      <div className="sh-card-accent" style={{ background: meta.gradient }} />

      <div className="sh-card-head">
        <div className="sh-card-head-left">
          <span className="sh-type-badge" style={{ background: meta.gradient }}>
            {meta.icon} {meta.label}
          </span>
          <h3 className="sh-card-title">{entry.process_name || '—'}</h3>
        </div>
        <time className="sh-card-time">{formatTimestamp(entry.timestamp)}</time>
      </div>

      <div className="sh-card-body">
        <div className="sh-meta-row">
          <div className="sh-pill">
            <span className="sh-pill-label">Student</span>
            <span className="sh-pill-value">
              {entry.student_name
                ? <>{entry.student_name} <span className="sh-pill-id">#{entry.student_id}</span></>
                : <>ID {entry.student_id}</>}
            </span>
          </div>
          {entry.process_lesson && (
            <div className="sh-pill" style={{ background: meta.accentSoft, borderColor: `${meta.accent}33` }}>
              <span className="sh-pill-label">Lesson</span>
              <span className="sh-pill-value">{entry.process_lesson}</span>
            </div>
          )}
        </div>

        <div className="sh-stats">
          <StatChip
            label="Score Before"
            value={entry.score_before_process ?? 0}
            bg="#f8fafc"
            color="#0f172a"
            border="#e2e8f0"
          />
          <StatChip
            label="Score After"
            value={entry.score_after_process ?? 0}
            bg="#0f172a"
            color="white"
            border="#0f172a"
            dark
          />
          {netB && (
            <StatChip
              label="Net Change"
              value={netB.label}
              bg={netB.bg}
              color={netB.color}
              border={netB.border}
            />
          )}
          {showBonus && (
            <StatChip
              label="Streak Bonus"
              value={bonusB.label}
              bg={bonusB.bg}
              color={bonusB.color}
              border={bonusB.border}
            />
          )}
        </div>

        {Array.isArray(entry.bonus_lessons) && entry.bonus_lessons.length > 0 && (
          <div className="sh-streak">
            <strong>Streak lessons:</strong> {entry.bonus_lessons.join(' · ')}
          </div>
        )}

        <div className="sh-reason" style={{ background: meta.accentSoft, borderColor: `${meta.accent}33` }}>
          <span className="sh-reason-icon" aria-hidden="true">💡</span>
          <p>{reason}</p>
        </div>
      </div>
    </article>
  );
}

function Pagination({ page, totalPages, onPage }) {
  if (totalPages <= 1) return null;
  const pages = [];
  const delta = 2;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) pages.push(i);
    else if (pages[pages.length - 1] !== '…') pages.push('…');
  }
  return (
    <div className="sh-pagination">
      <PagBtn disabled={page <= 1} onClick={() => onPage(page - 1)} aria="Previous">
        <IconChevronLeft size={16} />
      </PagBtn>
      {pages.map((p, i) =>
        p === '…'
          ? <span key={`e${i}`} className="sh-ellipsis">…</span>
          : <PagBtn key={p} active={p === page} onClick={() => onPage(p)} aria={`Page ${p}`}>{p}</PagBtn>
      )}
      <PagBtn disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria="Next">
        <IconChevronRight size={16} />
      </PagBtn>
    </div>
  );
}

function PagBtn({ children, active, disabled, onClick, aria }) {
  return (
    <button aria-label={aria} disabled={disabled} onClick={onClick} className={`sh-page-btn${active ? ' is-active' : ''}`}>
      {children}
    </button>
  );
}

export default function ScoringHistory() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const [searchInput, setSearchInput] = useState('');
  const [activeStudentId, setActiveStudentId] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const canAccess = profile && ['admin', 'developer', 'assistant'].includes(profile.role);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['scoring-history', activeStudentId, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (activeStudentId) params.set('student_id', activeStudentId);
      const res = await apiClient.get(`/api/scoring/history?${params}`);
      return res.data;
    },
    enabled: canAccess,
    keepPreviousData: true,
  });

  const handleSearch = useCallback(() => { setPage(1); setActiveStudentId(searchInput.trim()); }, [searchInput]);
  const handleClear = useCallback(() => { setSearchInput(''); setActiveStudentId(''); setPage(1); }, []);

  if (profileLoading) return <Spinner />;
  if (!canAccess) return <AccessDenied />;

  const history = data?.history ?? [];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;

  return (
    <div className="sh-page">
      <Title backText="Back" href="/dashboard/manage_scoring_system">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Image src="/history.svg" alt="Scoring History" width={30} height={30} />
          Scoring History
        </div>
      </Title>

      <div className="sh-toolbar">
        <SearchBar value={searchInput} onChange={setSearchInput} onSearch={handleSearch} />
        {activeStudentId && (
          <button type="button" className="sh-clear" onClick={handleClear}>
            Clear
          </button>
        )}
      </div>

      {isLoading && (
        <div className="sh-list sh-loader-wrap">
          <Spinner message="Loading history…" />
        </div>
      )}

      {isError && (
        <div className="sh-error">Failed to load scoring history. Please try again.</div>
      )}

      {!isLoading && !isError && history.length === 0 && (
        <div className="sh-empty">
          <div className="sh-count-wrap">
            <div className="sh-count">
              {activeStudentId
                ? `Student ID ${activeStudentId} — ${total} record${total !== 1 ? 's' : ''}`
                : `${total} record${total !== 1 ? 's' : ''} total`}
              {data && ` · page ${data.page} / ${totalPages}`}
            </div>
          </div>
          <div className="sh-empty-icon">📭</div>
          <p>
            {activeStudentId ? `No scoring history found for Student ID ${activeStudentId}.` : 'No scoring history records yet.'}
          </p>
        </div>
      )}

      {!isLoading && !isError && history.length > 0 && (
        <div className="sh-list">
          <div className="sh-count-wrap">
            <div className="sh-count">
              {activeStudentId
                ? `Student ID ${activeStudentId} — ${total} record${total !== 1 ? 's' : ''}`
                : `${total} record${total !== 1 ? 's' : ''} total`}
              {data && ` · page ${data.page} / ${totalPages}`}
            </div>
          </div>
          {history.map((entry) => (
            <HistoryCard key={entry._id ?? entry.process_id} entry={entry} />
          ))}
          <Pagination
            page={page}
            totalPages={totalPages}
            onPage={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          />
        </div>
      )}

      <style jsx>{`
        .sh-page {
          padding: 20px 16px 48px;
          max-width: 920px;
          margin: 0 auto;
          width: 100%;
          box-sizing: border-box;
        }

        .sh-toolbar {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 22px 0 16px;
          width: 100%;
        }

        .sh-clear {
          flex-shrink: 0;
          padding: 10px 16px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.55);
          background: rgba(15, 23, 42, 0.78);
          color: white;
          cursor: pointer;
          font-size: 0.875rem;
          font-weight: 700;
        }

        .sh-count-wrap {
          display: flex;
          justify-content: center;
          width: 100%;
        }

        .sh-count {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin: 0;
          padding: 8px 16px;
          border-radius: 999px;
          background: #0f172a;
          color: #f8fafc;
          font-size: 0.88rem;
          font-weight: 700;
          letter-spacing: 0.2px;
          text-align: center;
        }

        .sh-error {
          background: #fff1f2;
          border: 1px solid #fecaca;
          border-radius: 16px;
          padding: 20px 24px;
          color: #9f1239;
          text-align: center;
          font-size: 0.95rem;
          font-weight: 600;
        }

        .sh-empty {
          background: white;
          border-radius: 22px;
          padding: 64px 24px;
          box-shadow: 0 16px 40px rgba(15, 23, 42, 0.1);
          text-align: center;
        }

        .sh-empty-icon {
          font-size: 3rem;
          margin-bottom: 10px;
        }

        .sh-empty p {
          color: #475569;
          font-size: 1rem;
          margin: 0;
          font-weight: 600;
        }

        .sh-list {
          background: rgba(255, 255, 255, 0.94);
          border-radius: 24px;
          box-shadow: 0 18px 50px rgba(15, 23, 42, 0.14);
          border: 1px solid rgba(255, 255, 255, 0.7);
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        :global(.sh-card) {
          background: #ffffff;
          border-radius: 18px;
          overflow: hidden;
          border: 1px solid #e8eef5;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
        }

        :global(.sh-card-accent) {
          height: 4px;
        }

        :global(.sh-card-head) {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          padding: 14px 16px 12px;
          background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
        }

        :global(.sh-card-head-left) {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          min-width: 0;
          flex: 1;
        }

        :global(.sh-type-badge) {
          color: white;
          border-radius: 999px;
          padding: 5px 12px;
          font-size: 0.7rem;
          font-weight: 800;
          letter-spacing: 0.8px;
          text-transform: uppercase;
          white-space: nowrap;
        }

        :global(.sh-card-title) {
          margin: 0;
          font-weight: 800;
          color: #0f172a;
          font-size: 0.98rem;
          line-height: 1.4;
          word-break: break-word;
        }

        :global(.sh-card-time) {
          color: #475569;
          font-size: 0.8rem;
          font-weight: 600;
          white-space: nowrap;
        }

        :global(.sh-card-body) {
          padding: 4px 16px 16px;
        }

        :global(.sh-meta-row) {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 14px;
        }

        :global(.sh-pill) {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 999px;
          padding: 6px 12px;
        }

        :global(.sh-pill-label) {
          font-size: 0.7rem;
          color: #64748b;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        :global(.sh-pill-value) {
          font-weight: 700;
          color: #0f172a;
          font-size: 0.88rem;
        }

        :global(.sh-pill-id) {
          color: #64748b;
          font-weight: 600;
        }

        :global(.sh-stats) {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
          gap: 8px;
          align-items: stretch;
          margin-bottom: 12px;
        }

        :global(.sh-arrow) {
          display: none;
        }

        :global(.sh-streak) {
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 12px;
          padding: 9px 12px;
          margin-bottom: 12px;
          font-size: 0.82rem;
          color: #92400e;
          font-weight: 600;
        }

        :global(.sh-reason) {
          border: 1px solid;
          border-radius: 14px;
          padding: 12px 14px;
          display: flex;
          gap: 10px;
          align-items: flex-start;
        }

        :global(.sh-reason-icon) {
          flex-shrink: 0;
          margin-top: 1px;
        }

        :global(.sh-reason p) {
          margin: 0;
          font-size: 0.9rem;
          color: #334155;
          line-height: 1.55;
          font-weight: 500;
        }

        :global(.sh-pagination) {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          flex-wrap: wrap;
          padding: 8px 0 2px;
        }

        :global(.sh-ellipsis) {
          padding: 0 4px;
          color: #94a3b8;
        }

        :global(.sh-page-btn) {
          min-width: 38px;
          height: 38px;
          border-radius: 10px;
          border: 1px solid #e2e8f0;
          background: white;
          color: #334155;
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 8px;
        }

        :global(.sh-page-btn:disabled) {
          background: #f8fafc;
          color: #cbd5e1;
          cursor: not-allowed;
        }

        :global(.sh-page-btn.is-active) {
          border: none;
          background: linear-gradient(135deg, #38bdf8, #0284c7);
          color: white;
          box-shadow: 0 6px 16px rgba(14, 165, 233, 0.35);
        }

        @media (max-width: 560px) {
          .sh-page {
            padding: 16px 10px 40px;
          }
          .sh-list {
            padding: 12px;
            border-radius: 18px;
            gap: 12px;
          }
          .sh-toolbar {
            flex-direction: column;
            align-items: stretch;
          }
          .sh-count {
            font-size: 0.82rem;
          }
          :global(.sh-card-time) {
            white-space: normal;
          }
        }
      `}</style>
    </div>
  );
}

function Spinner({ message }) {
  return (
    <div className="sh-loader">
      <div className="sh-loader-ring" aria-hidden="true">
        <span />
        <span />
      </div>
      {message && <p className="sh-loader-text">{message}</p>}
      <style jsx>{`
        .sh-loader {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 56px 20px;
          text-align: center;
        }
        .sh-loader-ring {
          position: relative;
          width: 64px;
          height: 64px;
          margin-bottom: 18px;
        }
        .sh-loader-ring span {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 3px solid transparent;
        }
        .sh-loader-ring span:first-child {
          border-top-color: #38bdf8;
          border-right-color: #0284c7;
          animation: sh-spin 0.9s linear infinite;
          box-shadow: 0 0 18px rgba(14, 165, 233, 0.28);
        }
        .sh-loader-ring span:last-child {
          inset: 10px;
          border-bottom-color: #fbbf24;
          border-left-color: #d97706;
          animation: sh-spin-rev 1.3s linear infinite;
        }
        .sh-loader-text {
          margin: 0;
          color: #0f172a;
          font-size: 0.95rem;
          font-weight: 800;
          letter-spacing: 0.2px;
        }
        @keyframes sh-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes sh-spin-rev {
          to { transform: rotate(-360deg); }
        }
      `}</style>
    </div>
  );
}

function AccessDenied() {
  return (
    <div style={{ padding: '40px 20px', textAlign: 'center' }}>
      <div style={{ background: 'white', borderRadius: 18, padding: '48px 28px', boxShadow: '0 8px 32px rgba(0,0,0,0.1)', maxWidth: 480, margin: '0 auto' }}>
        <div style={{ fontSize: '3.5rem', marginBottom: 16 }}>🚫</div>
        <h2 style={{ color: '#dc2626', margin: '0 0 10px' }}>Access Denied</h2>
        <p style={{ color: '#6c757d', margin: 0 }}>You don&apos;t have permission to view scoring history.</p>
      </div>
    </div>
  );
}
