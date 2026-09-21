/**
 * Build a PNG data-URL of /logo.png clipped to rounded corners with a black border.
 * Used as the QR center logo so canvas exports (download/ZIP) match the UI.
 */

function roundedRectPath(ctx, x, y, w, h, radius) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * @param {string} src
 * @param {{ size?: number, radius?: number, borderWidth?: number, borderColor?: string }} [options]
 * @returns {Promise<string>}
 */
export function makeRoundedLogoDataUrl(
  src = '/logo.png',
  { size = 256, radius = 50, borderWidth = 10, borderColor = '#000000' } = {}
) {
  if (typeof window === 'undefined') {
    return Promise.resolve(src);
  }

  return new Promise((resolve) => {
    const img = new window.Image();
    img.decoding = 'async';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(src);
          return;
        }

        const inset = borderWidth / 2;
        const drawSize = size - borderWidth;
        const drawRadius = Math.max(0, radius - inset);

        roundedRectPath(ctx, inset, inset, drawSize, drawSize, drawRadius);
        ctx.save();
        ctx.clip();
        ctx.drawImage(img, inset, inset, drawSize, drawSize);
        ctx.restore();

        roundedRectPath(ctx, inset, inset, drawSize, drawSize, drawRadius);
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = borderWidth;
        ctx.stroke();

        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(src);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

/** Shared react-qrcode-logo props: no white pad, rounded logo image. */
export function getQrLogoProps(logoImage, logoSize) {
  return {
    logoImage,
    logoWidth: logoSize,
    logoHeight: logoSize,
    logoPadding: 0,
    removeQrCodeBehindLogo: false,
    ecLevel: 'H',
  };
}
