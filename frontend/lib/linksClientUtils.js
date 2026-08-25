import { isWhatsAppLinkName, socialIconSrc } from './marketingPageClientUtils';

export { socialIconSrc, isWhatsAppLinkName };

export function formatPhoneForWhatsApp(phone) {
  if (!phone) return '';
  return String(phone).replace(/[^0-9]/g, '');
}

/** @param {{ name?: string, link?: string, phone?: string }} row */
export function buildStoredLinkRow(row) {
  const name = (row.name || '').trim();
  if (!name) return null;
  let link = (row.link || '').trim();
  if (isWhatsAppLinkName(name)) {
    const digits = formatPhoneForWhatsApp(row.phone || link);
    if (!digits) return null;
    link = `https://wa.me/${digits}`;
  }
  if (!link) return null;
  return { name, link };
}

/** @param {Array<{ name?: string, link?: string, phone?: string }>} rows */
export function buildStoredLinksPayload(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(buildStoredLinkRow).filter(Boolean);
}

/** @param {{ name?: string, link?: string }} stored */
export function parseStoredLinkForEdit(stored) {
  const name = stored?.name || '';
  const link = stored?.link || '';
  if (isWhatsAppLinkName(name)) {
    const m = link.match(/wa\.me\/(\d+)/i);
    return { name, link: '', phone: m ? m[1] : '' };
  }
  return { name, link, phone: '' };
}

/** @param {{ name?: string, link?: string, phone?: string }} row */
export function resolveLinkHref(row) {
  const name = row?.name || '';
  const isWa = isWhatsAppLinkName(name);
  let href = (row?.link || '').trim();
  if (isWa) {
    const m = href.match(/wa\.me\/(\d+)/i);
    const digits = m ? m[1] : formatPhoneForWhatsApp(row?.phone || href);
    return digits ? `https://wa.me/${digits}` : '';
  }
  return href;
}
