/**
 * Route eligibility for DevTools deterrence.
 *
 * Public pages (login, signup, …): soft protect — overlay only, no logout.
 * Authenticated pages: hard protect — overlay + countdown logout.
 * Developers and embed shells: never protect.
 * Device gating (no phones/tablets) lives in classifyDevice.
 */

/** Keep in sync with `_app.js` `publicPages`. */
export const PUBLIC_PAGES = [
  '/',
  '/sign-up',
  '/contact_developer',
  '/contact_assistants',
  '/welcome',
  '/leave-a-review',
  '/404',
  '/forgot_password',
  '/student_not_found',
  '/dashboard/student_info',
];

const PUBLIC_EXACT = new Set(PUBLIC_PAGES);

const PUBLIC_PREFIXES = [
  '/leave-a-review',
];

const EMBED_PREFIXES = [
  '/api/youtube/',
  '/youtube-player/',
];

/**
 * @param {string} pathname
 * @returns {boolean}
 */
export function isPublicPath(pathname) {
  if (!pathname || typeof pathname !== 'string') return true;
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * @param {string} pathname
 * @param {string | null | undefined} userRole
 * @returns {{ protect: boolean, reason: string, soft?: boolean }}
 */
export function shouldProtectCurrentRoute(pathname, userRole) {
  if (!pathname) {
    return { protect: false, reason: 'no-pathname' };
  }

  if (userRole === 'developer') {
    return { protect: false, reason: 'developer-exempt' };
  }

  if (EMBED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return { protect: false, reason: 'embed-shell' };
  }

  // All public pages: overlay when DevTools open, never force logout
  if (isPublicPath(pathname)) {
    return { protect: true, soft: true, reason: 'public-route-soft' };
  }

  // Private routes: need a known non-developer role (authReady gated by caller)
  if (!userRole) {
    return { protect: false, reason: 'role-unknown' };
  }

  return { protect: true, soft: false, reason: 'authenticated-route' };
}
