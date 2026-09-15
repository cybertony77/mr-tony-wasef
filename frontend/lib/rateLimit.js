/**
 * Simple in-memory rate limiter (per process).
 * Good enough for single-node Next.js; use Redis in multi-instance prod.
 */

const buckets = new Map();

/**
 * @param {string} key
 * @param {{ windowMs?: number, max?: number }} opts
 * @returns {{ ok: boolean, retryAfterSec?: number }}
 */
export function checkRateLimit(key, opts = {}) {
  const windowMs = opts.windowMs ?? 60 * 1000;
  const max = opts.max ?? 20;
  const now = Date.now();
  let entry = buckets.get(key);
  if (!entry || now - entry.start >= windowMs) {
    entry = { start: now, count: 0 };
    buckets.set(key, entry);
  }
  entry.count += 1;
  if (entry.count > max) {
    const retryAfterSec = Math.ceil((entry.start + windowMs - now) / 1000);
    return { ok: false, retryAfterSec: Math.max(1, retryAfterSec) };
  }
  return { ok: true };
}

export function clientKey(req, suffix = '') {
  const xf = req.headers['x-forwarded-for'];
  const ip = Array.isArray(xf)
    ? xf[0]
    : String(xf || '')
        .split(',')[0]
        .trim() ||
      req.socket?.remoteAddress ||
      'unknown';
  return `${ip}:${suffix}`;
}
