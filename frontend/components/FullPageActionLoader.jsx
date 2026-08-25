import { createPortal } from 'react-dom';
import { useEffect } from 'react';
import styles from '../styles/ImportExistingOnlineItemModal.module.css';

/**
 * Same full-page spinner card used after homework/quiz import load.
 * Use for in-page actions (e.g. hide marketing page) — not the Welcome MarketingPageLoader.
 */
export default function FullPageActionLoader({
  active = false,
  label = 'Loading',
  sub = 'Please wait a moment.',
}) {
  useEffect(() => {
    if (!active) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);

  if (!active || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={styles.overlay}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <div className={styles.card}>
        <div className={styles.spinnerWrap} aria-hidden>
          <div className={styles.spinner} />
          <div className={styles.spinnerInner} />
        </div>
        <p className={styles.label}>
          <span className={styles.loadingText}>
            {label}
            <span className={styles.ellipsis}>
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          </span>
        </p>
        <p className={styles.sub}>{sub}</p>
      </div>
    </div>,
    document.body
  );
}
