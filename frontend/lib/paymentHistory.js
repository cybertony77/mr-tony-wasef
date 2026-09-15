/**
 * Append-only payment session history on student.payment.paymentHistory
 */

export function normalizePaymentHistory(payment) {
  const src = Array.isArray(payment) ? payment[0] : payment;
  if (!src || typeof src !== 'object') return [];
  const list = src.paymentHistory;
  return Array.isArray(list) ? list : [];
}

/**
 * @param {object} params
 * @param {'manual'|'clear'|'attendance_scan'|'zoom_meeting'|'google_meeting'|'vvc_unlock'|'vhc_unlock'|'session_deduct_unlock'|'refund_absence'|'bulk_absence'} params.type
 * @param {number} params.delta - change in numberOfSessions (+ add, - deduct)
 * @param {number} params.balanceAfter
 * @param {string} params.reason
 * @param {string} [params.lesson]
 * @param {string} [params.by]
 */
export function buildPaymentHistoryEntry({
  type,
  delta,
  balanceAfter,
  reason,
  lesson,
  by,
  contentKind = null,
}) {
  return {
    type,
    delta: Number(delta) || 0,
    balanceAfter: Number(balanceAfter) || 0,
    reason: String(reason || '').trim(),
    lesson: lesson ? String(lesson).trim() : null,
    contentKind: contentKind ? String(contentKind).trim() : null,
    by: by ? String(by).trim() : null,
    at: new Date().toISOString(),
  };
}
