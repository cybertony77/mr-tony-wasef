import sharp from 'sharp';
import { getSignedImageUrlServer } from './cloudinary';
import { normalizeCertificateImagePublicId } from './certificatesUtils';
import {
  fontWeightFor,
  getCertificateFont,
  loadGoogleFontBuffer,
} from './certificateFonts';
import { buildCenteredTextPath, parseFontBuffer } from './certificateTextPath';

const fontCache = new Map();

function escapeXml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function readCloudinaryImageBuffer(publicId) {
  const signedUrl = await getSignedImageUrlServer(publicId, { expiresInSeconds: 120 });
  if (!signedUrl) {
    const err = new Error('Failed to resolve certificate image');
    err.statusCode = 500;
    throw err;
  }

  const response = await fetch(signedUrl);
  if (!response.ok) {
    const err = new Error('Certificate image not found');
    err.statusCode = 404;
    throw err;
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function getCachedFontBuffer(fontFamily) {
  const key = String(fontFamily || '').trim();
  if (!key) return null;
  if (fontCache.has(key)) return fontCache.get(key);

  const loaded = await loadGoogleFontBuffer(key);
  fontCache.set(key, loaded || null);
  return loaded || null;
}

/**
 * Draw student name onto certificate template. Name must come from DB only.
 * X/Y are pixel positions from the top-left of the image (text is centered on that point).
 */
export async function generateCertificatePng({
  certificateImage,
  studentName,
  student_nameX,
  student_nameY,
  fontFamily = 'Roboto',
  fontSize = 75,
  textColor = '#1a1a1a',
}) {
  const publicId = normalizeCertificateImagePublicId(certificateImage);
  if (!publicId) {
    const err = new Error('Certificate image is missing');
    err.statusCode = 400;
    throw err;
  }

  const name = String(studentName || '').trim();
  if (!name) {
    const err = new Error('Student name is required');
    err.statusCode = 400;
    throw err;
  }

  const template = await readCloudinaryImageBuffer(publicId);
  const meta = await sharp(template).metadata();
  const width = meta.width || 1200;
  const height = meta.height || 800;

  const x = Math.max(0, Math.min(width, Number(student_nameX) || width / 2));
  const y = Math.max(0, Math.min(height, Number(student_nameY) || height / 2));
  const size = Math.max(1, Math.min(150, Number(fontSize) || 75));
  const fontMeta = getCertificateFont(fontFamily);
  const family =
    String(fontMeta?.cssFamily || fontMeta?.name || fontFamily || 'Arial').replace(
      /[^a-zA-Z0-9 ,\-']/g,
      ''
    ) || 'Arial';
  const weight = fontWeightFor(fontFamily);
  const color = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(textColor || '').trim())
    ? String(textColor).trim()
    : '#1a1a1a';

  let overlay = null;

  try {
    const loaded = await getCachedFontBuffer(fontFamily);
    if (loaded?.buffer?.length) {
      const font = parseFontBuffer(loaded.buffer);
      const { d, transform } = buildCenteredTextPath(font, name, size, x, y);
      if (d && !d.includes('NaN')) {
        // Full-canvas SVG (no resize) so script ascenders/descenders are not cropped
        const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" overflow="visible">
  <path d="${d}" fill="${escapeXml(color)}" transform="${transform}" />
</svg>`;
        overlay = await sharp(Buffer.from(svg), { density: 72, unlimited: true })
          .png()
          .toBuffer();
      }
    }
  } catch (err) {
    console.warn('Certificate path font render failed, falling back to SVG text:', err?.message || err);
  }

  if (!overlay) {
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <text
    x="${x}"
    y="${y}"
    fill="${escapeXml(color)}"
    font-size="${size}"
    font-family="${escapeXml(family)}, Arial, sans-serif"
    font-weight="${weight}"
    text-anchor="middle"
    dominant-baseline="middle"
  >${escapeXml(name)}</text>
</svg>`;
    overlay = await sharp(Buffer.from(svg), { density: 72 }).png().toBuffer();
  }

  return sharp(template)
    .composite([{ input: overlay, top: 0, left: 0 }])
    .png()
    .toBuffer();
}
