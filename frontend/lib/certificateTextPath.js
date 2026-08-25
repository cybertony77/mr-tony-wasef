import opentype from 'opentype.js';

/** Serialize path commands without opentype's toPathData() (it emits NaN and cuts names mid-string). */
function serializePath(path, decimals = 2) {
  const fmt = (n) => {
    if (!Number.isFinite(n)) return '0';
    const rounded = Number(Number(n).toFixed(decimals));
    return Object.is(rounded, -0) ? '0' : String(rounded);
  };

  let d = '';
  for (const c of path.commands || []) {
    switch (c.type) {
      case 'M':
        d += `M${fmt(c.x)} ${fmt(c.y)}`;
        break;
      case 'L':
        d += `L${fmt(c.x)} ${fmt(c.y)}`;
        break;
      case 'Q':
        d += `Q${fmt(c.x1)} ${fmt(c.y1)} ${fmt(c.x)} ${fmt(c.y)}`;
        break;
      case 'C':
        d += `C${fmt(c.x1)} ${fmt(c.y1)} ${fmt(c.x2)} ${fmt(c.y2)} ${fmt(c.x)} ${fmt(c.y)}`;
        break;
      case 'Z':
        d += 'Z';
        break;
      default:
        break;
    }
  }
  return d;
}

/**
 * Build glyph outlines without OpenType feature shaping.
 * Script fonts like Great Vibes crash opentype.js's default getPath() on
 * unsupported substitutions (ccmp/liga).
 */
function buildGlyphPath(font, text, fontSize) {
  const size = Math.max(1, Math.min(150, Number(fontSize) || 48));
  const str = String(text || '');
  const path = new opentype.Path();
  let x = 0;
  const scale = size / font.unitsPerEm;

  for (let i = 0; i < str.length; i += 1) {
    const glyph = font.charToGlyph(str[i]);
    path.extend(glyph.getPath(x, 0, size));
    let advance = (glyph.advanceWidth || 0) * scale;
    if (i + 1 < str.length) {
      try {
        const next = font.charToGlyph(str[i + 1]);
        advance += (font.getKerningValue(glyph, next) || 0) * scale;
      } catch {
        /* ignore kerning errors */
      }
    }
    x += advance;
  }

  return path;
}

/**
 * Build a centered SVG path for admin preview + PNG generation.
 */
export function buildCenteredTextPath(font, text, fontSize, centerX, centerY) {
  const path = buildGlyphPath(font, text, fontSize);
  const bbox = path.getBoundingBox();
  const midX = (bbox.x1 + bbox.x2) / 2;
  const midY = (bbox.y1 + bbox.y2) / 2;
  const dx = Number(centerX) - midX;
  const dy = Number(centerY) - midY;
  return {
    d: serializePath(path, 2),
    transform: `translate(${dx}, ${dy})`,
    bbox,
  };
}

export function parseFontBuffer(fontBuffer) {
  if (!fontBuffer) return null;
  if (fontBuffer instanceof ArrayBuffer) {
    return opentype.parse(fontBuffer);
  }
  // Always copy into a tight ArrayBuffer — Node Buffer pool views break opentype.parse
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer?.(fontBuffer)) {
    const copy = Buffer.from(fontBuffer);
    return opentype.parse(
      copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength)
    );
  }
  if (fontBuffer instanceof Uint8Array) {
    const copy = Uint8Array.from(fontBuffer);
    return opentype.parse(copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength));
  }
  return opentype.parse(fontBuffer);
}
