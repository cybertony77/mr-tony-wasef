/**
 * Download a PDF (or any file URL).
 * - Same-origin /api/files/* → include cookies (auth proxy)
 * - Cloudinary / external URLs → omit credentials (avoids CORS "Failed to fetch")
 */
export async function downloadFileUrl(url, fileName = 'file.pdf') {
  if (!url || typeof url !== 'string') {
    throw new Error('No file URL');
  }

  const trimmed = url.trim();
  const name = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  const isApiFiles =
    trimmed.startsWith('/api/files/') ||
    /\/api\/files\//.test(trimmed);

  // Prefer a direct navigation download for our auth proxy — more reliable than
  // fetch+blob for large PDFs and always sends cookies on same-origin.
  if (isApiFiles) {
    const sep = trimmed.includes('?') ? '&' : '?';
    const a = document.createElement('a');
    a.href = `${trimmed}${sep}download=1&filename=${encodeURIComponent(name)}`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }

  const res = await fetch(trimmed, { credentials: 'omit' });
  if (!res.ok) {
    throw new Error(`Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
