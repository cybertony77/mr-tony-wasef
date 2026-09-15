import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import RoleSelect from './RoleSelect';
import apiClient from '../lib/axios';
import styles from '../styles/ManageAppVideosModal.module.css';

const VIDEO_ROLES = ['admin', 'assistant', 'student'];

function detectLinkKind(url) {
  const lower = String(url || '').toLowerCase();
  if (lower.includes('youtube') || lower.includes('youtu.be')) return 'youtube';
  if (lower.includes('drive') || lower.includes('docs.google')) return 'drive';
  return 'link';
}

function linkIconSrc(kind) {
  if (kind === 'youtube') return '/youtube.svg';
  if (kind === 'drive') return '/drive.svg';
  return '/link.svg';
}

function createEmptyRow() {
  return {
    key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    video_title: '',
    video_url: '',
    video_role: '',
  };
}

function toEditableRows(videos) {
  if (!Array.isArray(videos) || !videos.length) return [createEmptyRow()];
  return videos.map((video, index) => ({
    key: String(video.id || `row-${index}`),
    video_title: String(video.video_title || ''),
    video_url: String(video.video_url || ''),
    video_role: String(video.video_role || '').toLowerCase(),
  }));
}

function serializeRows(rows) {
  return JSON.stringify(
    (rows || []).map((row) => ({
      video_title: String(row.video_title || '').trim(),
      video_url: String(row.video_url || '').trim(),
      video_role: String(row.video_role || '').trim().toLowerCase(),
    }))
  );
}

export default function ManageAppVideosModal({
  isOpen,
  onClose,
  onSaved,
  title = 'Manage App Videos',
  subtitle = 'Add, edit, or remove app explanation videos.',
}) {
  const panelRef = useRef(null);
  const baselineRef = useRef('[]');
  const [rows, setRows] = useState([createEmptyRow()]);
  const [openRoleKey, setOpenRoleKey] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | saving
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const isDirty = useMemo(
    () => serializeRows(rows) !== baselineRef.current,
    [rows]
  );

  useEffect(() => {
    if (!isOpen) return undefined;

    let cancelled = false;
    const load = async () => {
      setStatus('loading');
      setError('');
      setSuccess('');
      setOpenRoleKey(null);
      try {
        const { data } = await apiClient.get(`/api/app-videos?_=${Date.now()}`);
        if (cancelled) return;
        const nextRows = toEditableRows(data?.videos);
        setRows(nextRows);
        baselineRef.current = serializeRows(nextRows);
        setStatus('idle');
      } catch (err) {
        if (cancelled) return;
        setRows([createEmptyRow()]);
        baselineRef.current = serializeRows([createEmptyRow()]);
        setError(err?.response?.data?.error || err?.message || 'Could not load videos');
        setStatus('idle');
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const updateRow = (key, patch) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    setError('');
    setSuccess('');
  };

  const handleAdd = () => {
    setRows((prev) => [...prev, createEmptyRow()]);
    setError('');
    setSuccess('');
  };

  const handleDelete = (key) => {
    setRows((prev) => {
      const next = prev.filter((row) => row.key !== key);
      return next.length ? next : [createEmptyRow()];
    });
    setOpenRoleKey((prev) => (prev === key ? null : prev));
    setError('');
    setSuccess('');
  };

  const validate = () => {
    for (let i = 0; i < rows.length; i += 1) {
      const title = String(rows[i].video_title || '').trim();
      const url = String(rows[i].video_url || '').trim();
      const role = String(rows[i].video_role || '').trim().toLowerCase();
      const empty = !title && !url && !role;
      if (empty) continue;
      if (!title) return `Video ${i + 1}: title is required`;
      if (!url || !/^https?:\/\//i.test(url)) {
        return `Video ${i + 1}: a valid https URL is required`;
      }
      if (!VIDEO_ROLES.includes(role)) {
        return `Video ${i + 1}: select a role (admin, assistant, or student)`;
      }
    }
    return '';
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    const payload = rows
      .map((row, index) => ({
        video_title: String(row.video_title || '').trim(),
        video_url: String(row.video_url || '').trim(),
        video_role: String(row.video_role || '').trim().toLowerCase(),
        sort_order: index,
      }))
      .filter((row) => row.video_title && row.video_url && row.video_role);

    setStatus('saving');
    setError('');
    setSuccess('');
    try {
      const { data } = await apiClient.put('/api/app-videos', { videos: payload });
      const nextRows = toEditableRows(data?.videos);
      setRows(nextRows);
      baselineRef.current = serializeRows(nextRows);
      setSuccess('Videos saved successfully');
      setStatus('idle');
      if (typeof onSaved === 'function') onSaved(data?.videos || []);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to save videos');
      setStatus('idle');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={styles.panel}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-app-videos-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <div className={styles.headerIcon}>
            <Image src="/settings.svg" alt="" width={24} height={24} />
          </div>
          <div className={styles.headerText}>
            <h2 id="manage-app-videos-title" className={styles.title}>
              {title}
            </h2>
            <p className={styles.subtitle}>{subtitle}</p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <Image src="/close-cross.svg" alt="" width={26} height={26} />
          </button>
        </div>

        <div className={styles.body}>
          {status === 'loading' ? (
            <div className={styles.loadingBox}>
              <div className={styles.spinner} />
              <p>Loading videos…</p>
            </div>
          ) : (
            <>
              <div className={styles.list}>
                {rows.map((row, index) => (
                  <article key={row.key} className={styles.card}>
                    <div className={styles.cardTop}>
                      <span className={styles.cardIndex}>Video {index + 1}</span>
                      <button
                        type="button"
                        className={styles.deleteBtn}
                        onClick={() => handleDelete(row.key)}
                        aria-label={`Delete video ${index + 1}`}
                      >
                        <Image src="/trash.svg" alt="" width={16} height={16} />
                        Delete
                      </button>
                    </div>

                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Video Title</span>
                      <div className={styles.inputWrap}>
                        <span className={styles.inputIcon} aria-hidden>
                          <Image src="/video.svg" alt="" width={18} height={18} />
                        </span>
                        <input
                          type="text"
                          className={styles.input}
                          value={row.video_title}
                          onChange={(e) => updateRow(row.key, { video_title: e.target.value })}
                          placeholder="e.g. Sign up Video"
                          autoComplete="off"
                        />
                      </div>
                    </label>

                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Video URL</span>
                      <div className={styles.inputWrap}>
                        <span className={styles.inputIcon} aria-hidden>
                          <Image
                            src={linkIconSrc(detectLinkKind(row.video_url))}
                            alt=""
                            width={18}
                            height={18}
                          />
                        </span>
                        <input
                          type="url"
                          className={styles.input}
                          value={row.video_url}
                          onChange={(e) => updateRow(row.key, { video_url: e.target.value })}
                          placeholder="https://..."
                          autoComplete="off"
                        />
                      </div>
                    </label>

                    <div className={styles.field}>
                      <span className={styles.fieldLabel}>Role</span>
                      <RoleSelect
                        selectedRole={row.video_role}
                        onRoleChange={(role) => updateRow(row.key, { video_role: role })}
                        roles={VIDEO_ROLES}
                        isOpen={openRoleKey === row.key}
                        onToggle={() =>
                          setOpenRoleKey((prev) => (prev === row.key ? null : row.key))
                        }
                        onClose={() => setOpenRoleKey((prev) => (prev === row.key ? null : prev))}
                      />
                    </div>
                  </article>
                ))}
              </div>

              <button type="button" className={styles.addBtn} onClick={handleAdd}>
                <Image src="/plus.svg" alt="" width={18} height={18} />
                Add Video Link
              </button>
            </>
          )}

          {error ? <div className={styles.errorMsg}>{error}</div> : null}
          {success ? <div className={styles.successMsg}>{success}</div> : null}
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={!isDirty || status === 'saving' || status === 'loading'}
          >
            {status === 'saving' ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onClose}
            disabled={status === 'saving'}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
