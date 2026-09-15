/**
 * Normalize stored pdf_url values for PdfViewerModal / downloads.
 * - R2 uploads: `/api/files/pdfs/...` or bare `pdfs/...` keys
 * - Cloudinary: `https://res.cloudinary.com/...` → same-origin `/api/pdf-proxy`
 */

export function isCloudinaryPdfUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    return host === 'res.cloudinary.com' || host.endsWith('.cloudinary.com');
  } catch {
    return false;
  }
}

/** @returns {string|null} R2 object key like `pdfs/HW-PDFs/foo.pdf` */
export function extractR2PdfKeyFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (/^pdfs\//i.test(trimmed) && !trimmed.startsWith('http')) {
    return trimmed.replace(/^\/+/, '');
  }
  try {
    const u = new URL(trimmed);
    const path = u.pathname || '';
    const pdfsIdx = path.indexOf('/pdfs/');
    if (pdfsIdx !== -1) {
      return path.slice(pdfsIdx + 1);
    }
    const match = path.match(/\/(pdfs\/[^?#]+)/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export function isSameOriginPdfDeliveryUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  return (
    trimmed.startsWith('/api/files/') ||
    trimmed.includes('/api/files/') ||
    trimmed.startsWith('/api/pdf-proxy')
  );
}

/**
 * URL passed to react-pdf (pdf.js).
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
export function resolvePdfViewerUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (isSameOriginPdfDeliveryUrl(trimmed)) {
    return trimmed;
  }

  const r2Key = extractR2PdfKeyFromUrl(trimmed);
  if (r2Key) {
    return `/api/files/${r2Key.split('/').map(encodeURIComponent).join('/')}`;
  }

  if (isCloudinaryPdfUrl(trimmed)) {
    return `/api/pdf-proxy?url=${encodeURIComponent(trimmed)}`;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return trimmed;
}
