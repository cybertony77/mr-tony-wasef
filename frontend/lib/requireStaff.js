/**
 * Role helpers for API authorization.
 * Prefer these over ad-hoc role string checks.
 */

import {
  assertStaffSubscriptionAccess,
  ForbiddenError,
} from './subscriptionGuard';

export { ForbiddenError };

export const STAFF_ROLES = ['admin', 'developer', 'assistant'];
export const ADMIN_ROLES = ['admin', 'developer'];

export function isStaffRole(role) {
  return STAFF_ROLES.includes(String(role || ''));
}

export function isAdminRole(role) {
  return ADMIN_ROLES.includes(String(role || ''));
}

/** JWT uses assistant_id for all roles (including students). */
export function getAuthUserId(user) {
  const raw = user?.assistant_id ?? user?.id;
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
}

/** True when the caller is a student reading/writing their own record. */
export function isSelfStudent(user, studentId) {
  if (!user || user.role !== 'student') return false;
  return Number(getAuthUserId(user)) === Number(studentId);
}

/** Throws ForbiddenError unless user has a staff role. Also enforces active subscription for admin/assistant. */
export async function requireStaff(user) {
  if (!user || !isStaffRole(user.role)) {
    throw new ForbiddenError('Forbidden: staff only');
  }
  await assertStaffSubscriptionAccess(user);
  return user;
}

/**
 * Staff may access any student; a student may only access their own id.
 * Subscription gate applies only to staff (admin/assistant).
 */
export async function requireStaffOrSelfStudent(user, studentId) {
  if (isSelfStudent(user, studentId)) return user;
  return requireStaff(user);
}

/** Throws ForbiddenError unless admin or developer. */
export async function requireAdmin(user) {
  if (!user || !isAdminRole(user.role)) {
    throw new ForbiddenError('Forbidden: admin only');
  }
  await assertStaffSubscriptionAccess(user);
  return user;
}

export function isForbiddenError(error) {
  return (
    error?.name === 'ForbiddenError' ||
    error?.statusCode === 403 ||
    String(error?.message || '').startsWith('Forbidden') ||
    error?.code === 'subscription_inactive' ||
    error?.message === 'subscription_inactive'
  );
}

/** Standard 403 JSON body for staff API handlers */
export function forbiddenJson(error) {
  if (error?.code === 'subscription_inactive' || error?.message === 'subscription_inactive') {
    return {
      error: 'subscription_inactive',
      code: 'subscription_inactive',
      message: 'Subscription expired or inactive',
    };
  }
  return {
    error: 'Forbidden',
    message: error?.message || 'Forbidden',
  };
}
