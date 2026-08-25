import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useProfile } from '../../../lib/api/auth';
import Title from '../../../components/Title';
import LinkFormModal from '../../../components/LinkFormModal';
import LinksGridView from '../../../components/LinksGridView';
import apiClient from '../../../lib/axios';
import {
  buildStoredLinkRow,
  buildStoredLinksPayload,
  parseStoredLinkForEdit,
  socialIconSrc,
} from '../../../lib/linksClientUtils';
import styles from '../../../styles/links.module.css';

const BACK_BTN = {
  background: 'linear-gradient(90deg, rgb(108, 117, 125) 0%, rgb(73, 80, 87) 100%)',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  padding: '8px 16px',
  fontWeight: 600,
  fontSize: 15,
};

/** Same preloader as `_app.js` (logo + spinner), not the welcome MarketingPageLoader. */
function AppPreloader() {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'var(--system-page-bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        animation: 'fadeIn 0.3s ease-in-out',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
        }}
      >
        <div
          style={{
            position: 'relative',
            animation: 'pulse 2s ease-in-out infinite',
          }}
        >
          <Image
            src="/logo.png"
            alt="Logo"
            width={150}
            height={150}
            style={{ borderRadius: '50%', background: 'transparent' }}
          />
        </div>
        <div
          style={{
            width: '50px',
            height: '50px',
            border: '4px solid rgba(255, 255, 255, 0.3)',
            borderTop: '4px solid #1FA8DC',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
      </div>
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.8; }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default function ManageLinksPage() {
  const { data: profile, isLoading } = useProfile();
  const [accessDenied, setAccessDenied] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editIndex, setEditIndex] = useState(null);
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState(null);

  const allowedRoles = ['admin', 'developer', 'assistant'];

  useEffect(() => {
    if (!isLoading && profile && !allowedRoles.includes(profile.role)) {
      setAccessDenied(true);
    }
  }, [profile, isLoading]);

  const fetchLinks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/api/links');
      setItems(res.data?.items || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoading && profile && allowedRoles.includes(profile.role)) {
      fetchLinks();
    }
  }, [isLoading, profile, fetchLinks]);

  const persistItems = async (nextRows) => {
    setSaving(true);
    try {
      const payload = buildStoredLinksPayload(nextRows);
      const res = await apiClient.patch('/api/links', { items: payload });
      setItems(res.data?.items || payload);
    } finally {
      setSaving(false);
    }
  };

  const openAdd = () => {
    setEditIndex(null);
    setFormOpen(true);
  };

  const openEdit = (index) => {
    setEditIndex(index);
    setFormOpen(true);
  };

  const handleFormSave = async (row) => {
    const stored = buildStoredLinkRow(row);
    if (!stored) return;
    const draft = items.map((item) => parseStoredLinkForEdit(item));
    if (editIndex === null) {
      draft.push(row);
    } else {
      draft[editIndex] = row;
    }
    await persistItems(draft);
  };

  const handleDelete = async (index) => {
    const draft = items
      .filter((_, i) => i !== index)
      .map((item) => parseStoredLinkForEdit(item));
    await persistItems(draft);
  };

  const requestDelete = (index) => setDeleteConfirmIndex(index);

  const cancelDelete = () => setDeleteConfirmIndex(null);

  const confirmDelete = async () => {
    if (deleteConfirmIndex === null) return;
    const index = deleteConfirmIndex;
    try {
      await handleDelete(index);
    } finally {
      setDeleteConfirmIndex(null);
    }
  };

  const deleteTargetName =
    deleteConfirmIndex !== null && deleteConfirmIndex >= 0 && deleteConfirmIndex < items.length
      ? items[deleteConfirmIndex]?.name
      : '';

  const formInitial = useMemo(() => {
    if (editIndex === null) return { name: '', link: '', phone: '' };
    if (editIndex < 0 || editIndex >= items.length) return { name: '', link: '', phone: '' };
    return parseStoredLinkForEdit(items[editIndex]);
  }, [editIndex, items]);

  if (isLoading || loading) {
    return <AppPreloader />;
  }

  if (accessDenied || !profile || !allowedRoles.includes(profile.role)) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <h2 style={{ color: '#dc3545' }}>Access Denied</h2>
      </div>
    );
  }

  return (
    <div className={styles.managePage}>
      <Title backText="Back" href="/dashboard/manage_online_system" backButtonStyle={BACK_BTN}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Image src="/link.svg" alt="" width={32} height={32} />
          Social Media Links
        </span>
      </Title>

      <div className={styles.manageCard}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionHeaderText}>
            <h3 className={styles.sectionTitle}>Manage links</h3>
            <p className={styles.sectionSubtitle}>
              Add social media links, Facebook, Instagram, Youtube, and other links. Students see them in the Links menu.
            </p>
            <span className={styles.linkCountBadge}>
              {items.length} {items.length === 1 ? 'link' : 'links'}
            </span>
          </div>
          <button
            type="button"
            className={`${styles.btnAdd} ${styles.btnAddLight} ${styles.btnAddTop}`}
            onClick={openAdd}
            disabled={saving}
          >
            <Image src="/plus.svg" alt="" width={18} height={18} />
            Add link
          </button>
        </div>

        {items.length === 0 && !saving ? (
          <div className={styles.emptyStateManage}>
            <div className={styles.emptyStateIcon}>
              <Image src="/link.svg" alt="" width={28} height={28} />
            </div>
            <p className={styles.emptyStateTitle}>No links yet</p>
            <p className={styles.emptyStateDesc}>
              Create your first link so students can open Facebook, Instagram, Youtube, and more from their
              dashboard.
            </p>
          </div>
        ) : (
          <div className={styles.builderList}>
            {items.map((item, i) => (
              <div key={`${item.name}-${i}`} className={`${styles.builderCard} ${styles.builderCardLight}`}>
                <div className={styles.builderCardRow}>
                  <div className={styles.builderCardIcon}>
                    <Image src={socialIconSrc(item.name)} alt="" width={24} height={24} />
                  </div>
                  <div className={styles.builderCardInfo}>
                    <div className={`${styles.builderCardName} ${styles.builderCardNameLight}`}>
                      {item.name}
                    </div>
                    <div className={styles.builderCardUrl}>{item.link}</div>
                  </div>
                </div>
                <div className={styles.builderCardActions}>
                  <button type="button" className={styles.btnEdit} onClick={() => openEdit(i)} disabled={saving}>
                    <Image src="/edit.svg" alt="" width={16} height={16} />
                    Edit
                  </button>
                  <button type="button" className={styles.btnDelete} onClick={() => requestDelete(i)} disabled={saving}>
                    <Image src="/trash2.svg" alt="" width={16} height={16} />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {saving && (
          <div className={styles.savingBanner}>
            <span className={styles.savingSpinner} aria-hidden />
            Saving changes…
          </div>
        )}

        {items.length > 0 && (
          <div className={styles.previewSection}>
            <div className={styles.previewSectionHeader}>
              <Image src="/link2.svg" alt="" width={22} height={22} />
              <h4 className={styles.previewSectionTitle}>Student preview</h4>
              <span className={styles.previewSectionHint}>How students see these links</span>
            </div>
            <div className={styles.previewFrame}>
              <LinksGridView items={items} />
            </div>
          </div>
        )}
      </div>

      <LinkFormModal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={handleFormSave}
        initialRow={formInitial}
        formKey={editIndex === null ? 'new' : `edit-${editIndex}`}
        title={editIndex === null ? 'Add link' : 'Edit link'}
        light
      />

      {deleteConfirmIndex !== null && (
        <div
          className={styles.confirmOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-link-confirm-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !saving) cancelDelete();
          }}
        >
          <div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
            <h3 id="delete-link-confirm-title" className={styles.confirmTitle}>
              Delete link?
            </h3>
            <p className={styles.confirmMessage}>
              Are you sure you want to delete{' '}
              <strong>{deleteTargetName || 'this link'}</strong>? This action cannot be undone.
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.confirmDeleteBtn}
                onClick={confirmDelete}
                disabled={saving}
              >
                {saving ? 'Deleting…' : 'Delete'}
              </button>
              <button
                type="button"
                className={styles.confirmCancelBtn}
                onClick={cancelDelete}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
