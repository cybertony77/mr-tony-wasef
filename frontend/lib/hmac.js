/**
 * Client-safe stubs. Real HMAC lives in hmacServer.js (API routes only).
 * Do not put secrets here — this file is bundled for the browser.
 */

export function generateSignature() {
  throw new Error(
    'Client-side public-link signing is disabled. Use /api/students/public-link'
  );
}

export function verifySignature() {
  // Client must not verify — trust the public API response instead
  return false;
}

export function createPublicStudentUrl(studentId) {
  // Path without sig — callers should use generatePublicStudentLink (async API)
  return `/dashboard/student_info?id=${encodeURIComponent(String(studentId || ''))}`;
}
