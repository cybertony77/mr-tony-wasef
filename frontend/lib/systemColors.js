export const DEFAULT_SYSTEM_BACKGROUND =
  'linear-gradient(380deg, #1FA8DC 0%, #FEB954 100%)';

/**
 * Parse SYSTEM_COLORS from env.config.
 * Accepts either:
 *   - "background: linear-gradient(...);"
 *   - "linear-gradient(...)"
 */
export function parseSystemBackground(raw) {
  if (raw == null || String(raw).trim() === '') {
    return DEFAULT_SYSTEM_BACKGROUND;
  }

  let value = String(raw).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }

  const match = value.match(/^\s*background\s*:\s*(.+?)\s*;?\s*$/i);
  if (match) {
    value = match[1].trim();
  } else {
    value = value.replace(/;+\s*$/, '').trim();
  }

  return value || DEFAULT_SYSTEM_BACKGROUND;
}

/** Extract first/last color stops from a CSS linear-gradient (for canvas). */
export function parseGradientColorStops(backgroundCss) {
  const bg = parseSystemBackground(backgroundCss);
  const colors = bg.match(/#(?:[0-9a-fA-F]{3,8})\b|rgba?\([^)]+\)/g) || [];
  if (colors.length >= 2) {
    return { start: colors[0], end: colors[colors.length - 1] };
  }
  if (colors.length === 1) {
    return { start: colors[0], end: colors[0] };
  }
  return { start: '#1FA8DC', end: '#FEB954' };
}

/** Build a canvas linear gradient using SYSTEM_COLORS stops. */
export function createSystemCanvasGradient(ctx, x0, y0, x1, y1, backgroundCss) {
  const { start, end } = parseGradientColorStops(backgroundCss);
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
  gradient.addColorStop(0, start);
  gradient.addColorStop(1, end);
  return gradient;
}

/** Resolve current page background on the client (CSS var → cache → default). */
export function getClientSystemBackground(fallback) {
  if (fallback) return parseSystemBackground(fallback);
  if (typeof window === 'undefined') return DEFAULT_SYSTEM_BACKGROUND;
  try {
    const fromCss = window
      .getComputedStyle(document.documentElement)
      .getPropertyValue('--system-page-bg')
      .trim();
    if (fromCss) return fromCss;
    const cached = window.sessionStorage.getItem('system-page-bg');
    if (cached) return cached;
  } catch {
    /* ignore */
  }
  return DEFAULT_SYSTEM_BACKGROUND;
}

/** Server-only: read SYSTEM_COLORS from env.config (safe to import from client — no-ops in browser). */
export function loadSystemBackgroundFromEnv() {
  if (typeof window !== 'undefined') {
    return DEFAULT_SYSTEM_BACKGROUND;
  }

  try {
    // Lazy require so the client bundle does not pull in Node fs
    // eslint-disable-next-line global-require
    const fs = require('fs');
    // eslint-disable-next-line global-require
    const path = require('path');

    const candidates = [
      path.join(process.cwd(), '..', 'env.config'),
      path.join(process.cwd(), 'env.config'),
    ];
    const envPath = candidates.find((p) => fs.existsSync(p));
    if (!envPath) {
      return parseSystemBackground(process.env.SYSTEM_COLORS);
    }

    const envVars = {};
    fs.readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const index = trimmed.indexOf('=');
        if (index === -1) return;
        const key = trimmed.substring(0, index).trim();
        let val = trimmed.substring(index + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        envVars[key] = val;
      });

    return parseSystemBackground(envVars.SYSTEM_COLORS || process.env.SYSTEM_COLORS);
  } catch {
    return parseSystemBackground(process.env.SYSTEM_COLORS);
  }
}
