import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';
import { isWhatsAppLinkName } from '../lib/linksClientUtils';
import styles from '../styles/links.module.css';

const EMPTY = { name: '', link: '', phone: '' };

function isValidHttpUrl(value) {
  const v = String(value || '').trim();
  return /^https?:\/\/\S+$/i.test(v);
}

export default function LinkFormModal({
  isOpen,
  onClose,
  onSave,
  initialRow = EMPTY,
  formKey = 'new',
  title = 'Add link',
  light = false,
}) {
  const modalRef = useRef(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const lastFormKeyRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      lastFormKeyRef.current = null;
      return;
    }
    if (lastFormKeyRef.current === formKey) return;
    lastFormKeyRef.current = formKey;
    setForm({
      name: initialRow.name || '',
      link: initialRow.link || '',
      phone: initialRow.phone || '',
    });
    setFormError('');
  }, [isOpen, formKey, initialRow.name, initialRow.link, initialRow.phone]);

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

  const isWa = isWhatsAppLinkName(form.name);
  const labelClass = light ? styles.formLabelLight : styles.formLabel;
  const inputClass = light ? `${styles.formInput} ${styles.formInputLight}` : styles.formInput;
  const panelClass = light ? `${styles.panel} ${styles.panelLight}` : styles.panel;
  const headerClass = light ? `${styles.modalHeader} ${styles.modalHeaderLight}` : styles.modalHeader;
  const titleClass = light ? `${styles.modalTitle} ${styles.modalTitleLight}` : styles.modalTitle;
  const secondaryClass = light ? `${styles.btnSecondary} ${styles.btnSecondaryLight}` : styles.btnSecondary;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isWa) {
      const link = (form.link || '').trim();
      if (link && !isValidHttpUrl(link)) {
        setFormError('URL must start with http:// or https://');
        return;
      }
    }
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} role="presentation">
      <div
        className={panelClass}
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-form-title"
      >
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
          <Image src="/close-cross.svg" alt="" width={35} height={35} />
        </button>
        <div className={headerClass}>
          <Image src="/link.svg" alt="" width={28} height={28} />
          <h2 id="link-form-title" className={titleClass}>
            {title}
          </h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label className={labelClass}>Button text</label>
            <input
              className={inputClass}
              placeholder="e.g. Facebook Page"
              value={form.name}
              onChange={(e) => {
                setForm({ ...form, name: e.target.value });
                if (formError) setFormError('');
              }}
              required
            />
          </div>
          {isWa ? (
            <div className={styles.formGroup}>
              <label className={labelClass}>WhatsApp number</label>
              <PhoneInput
                country="eg"
                value={form.phone || ''}
                onChange={(phone) => setForm({ ...form, phone })}
                inputStyle={{ width: '100%', height: 48, borderRadius: 10 }}
              />
            </div>
          ) : (
            <div className={styles.formGroup}>
              <label className={labelClass}>URL</label>
              <input
                className={inputClass}
                type="url"
                placeholder="https://example.com"
                value={form.link}
                onChange={(e) => {
                  setForm({ ...form, link: e.target.value });
                  if (formError) setFormError('');
                }}
                required={!isWa}
              />
            </div>
          )}
          {formError ? (
            <p style={{ color: '#dc3545', margin: '4px 0 0', fontSize: '0.9rem', fontWeight: 600 }}>
              {formError}
            </p>
          ) : null}
          <div className={styles.modalActions}>
            <button type="submit" className={styles.btnPrimary} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className={secondaryClass} onClick={onClose} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
