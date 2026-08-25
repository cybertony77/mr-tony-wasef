import Image from 'next/image';
import { resolveLinkHref, socialIconSrc } from '../lib/linksClientUtils';
import styles from '../styles/links.module.css';

export default function LinksGridView({ items = [], className = '', light = false }) {
  const visible = items.filter((row) => row?.name?.trim() && row?.link?.trim());

  if (!visible.length) {
    return (
      <p className={`${styles.emptyLinks} ${light ? styles.emptyLinksLight : ''}`.trim()}>
        No links available yet.
      </p>
    );
  }

  const btnClass = light ? `${styles.linkBtn} ${styles.linkBtnLight}` : styles.linkBtn;

  return (
    <div className={`${styles.linksGrid} ${className}`.trim()}>
      {visible.map((row, idx) => {
        const href = resolveLinkHref(row);
        if (!href) return null;
        const name = row.name.trim();
        return (
          <a
            key={`${name}-${idx}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={btnClass}
          >
            <Image src={socialIconSrc(name)} alt="" width={26} height={26} />
            <span>{name}</span>
          </a>
        );
      })}
    </div>
  );
}
