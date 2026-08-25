import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { Great_Vibes } from 'next/font/google';
import styles from '../styles/MarketingPageLoader.module.css';

const welcomeFont = Great_Vibes({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
});

export default function MarketingPageLoader({
  active = true,
  label = 'Welcome',
  keyword = '',
}) {
  const [shouldRender, setShouldRender] = useState(active);
  const [isVisible, setIsVisible] = useState(active);

  useEffect(() => {
    if (active) {
      setShouldRender(true);
      const frame = window.requestAnimationFrame(() => setIsVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }

    setIsVisible(false);
    const timeoutId = window.setTimeout(() => setShouldRender(false), 820);
    return () => window.clearTimeout(timeoutId);
  }, [active]);

  if (typeof document === 'undefined' || !shouldRender) return null;

  const ariaLabel = keyword ? `${label} · ${keyword}` : label;

  return createPortal(
    <div
      className={`${styles.overlay} ${isVisible ? styles.visible : styles.hidden}`}
      role="status"
      aria-live="polite"
      aria-busy={active}
      aria-label={ariaLabel}
    >
      <div className={styles.wordWrap}>
        <div className={styles.wordStack}>
          <div className={`${styles.word} ${welcomeFont.className}`}>Welcome</div>
          {keyword ? <div className={styles.keyword}>{keyword}</div> : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
