/**
 * Route eligibility for DevTools deterrence.
 * Fail open: if unsure, do not protect.
 */

const PUBLIC_EXACT = new Set([
  '/',
  '/sign-up',
  '/contact_developer',
  '/contact_assistants',
  '/welcome',
  '/leave-a-review',
  '/forgot_password',
  '/404',
  '/student_not_found',
  '/dashboard/student_info', // public HMAC / token-optional page
]);

const PUBLIC_PREFIXES = [
  '/leave-a-review',
  '/api/youtube/',
  '/youtube-player/',
];

/**
 * Pages that never need DevTools deterrence (staff tooling is trusted / developer exempt separately).
 */
const STAFF_PREFIXES = [
  '/dashboard',
  '/manage_assistants',
  '/subscription_dashboard',
  '/edit_my_profile',
];

/**
 * Student content areas where soft deterrence is intentional.
 */
const STUDENT_PROTECTED_PREFIXES = [
  '/student_dashboard',
];

export function isPublicPath(pathname) {
  if (!pathname || typeof pathname !== 'string') return true;
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * @param {string} pathname
 * @param {string | null | undefined} userRole
 * @returns {{ protect: boolean, reason: string }}
 */
export function shouldProtectCurrentRoute(pathname, userRole) {
  if (!pathname) {
    return { protect: false, reason: 'no-pathname' };
  }

  if (isPublicPath(pathname)) {
    return { protect: false, reason: 'public-route' };
  }

  // Developer is always exempt
  if (userRole === 'developer') {
    return { protect: false, reason: 'developer-exempt' };
  }

  // Role unknown → fail open (auth still loading or anonymous)
  if (!userRole) {
    return { protect: false, reason: 'role-unknown' };
  }

  // Only students receive DevTools deterrence (admins/assistants do not)
  if (userRole !== 'student') {
    return { protect: false, reason: 'non-student-role' };
  }

  // Student on staff-looking paths (shouldn't happen often) → fail open
  if (STAFF_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    // Allow student_info under dashboard is public already; other /dashboard/* for students → skip
    if (pathname.startsWith('/dashboard')) {
      return { protect: false, reason: 'student-on-staff-route' };
    }
  }

  if (STUDENT_PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return { protect: true, reason: 'student-protected-route' };
  }

  // Authenticated student on other non-public app routes (e.g. edit profile)
  // Keep soft protection only for student_dashboard content by default (fail open elsewhere)
  return { protect: false, reason: 'student-unlisted-route' };
}
