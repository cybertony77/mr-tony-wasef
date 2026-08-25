import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import apiClient from '../lib/axios';
import LinksGridView from './LinksGridView';
import styles from '../styles/links.module.css';

export default function StudentLinksModal({ isOpen, onClose }) {
  const modalRef = useRef(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await apiClient.get('/api/links');
        if (!cancelled) setItems(res.data?.items || []);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose();
      }
    }
    function handleEscape(e) {
      if (e.key === 'Escape' && isOpen) onClose();
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} role="presentation">
      <div
        className={styles.panel}
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-links-title"
      >
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
          <Image src="/close-cross.svg" alt="" width={35} height={35} />
        </button>
        <div className={styles.modalHeader}>
          <Image src="/link2.svg" alt="" width={32} height={32} />
          <h2 id="student-links-title" className={styles.modalTitle}>
            Social Media Links
          </h2>
        </div>
        {loading ? (
          <p className={styles.emptyLinks}>Loading links…</p>
        ) : (
          <LinksGridView items={items} />
        )}
      </div>
    </div>
  );
}
