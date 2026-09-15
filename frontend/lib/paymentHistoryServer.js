import {
  buildPaymentHistoryEntry,
  normalizePaymentHistory,
} from './paymentHistory';

export function normalizeStudentPayment(payment) {
  const src = Array.isArray(payment) ? payment[0] : payment;
  if (!src || typeof src !== 'object') {
    return {
      numberOfSessions: 0,
      cost: null,
      paymentComment: null,
      date: null,
      paymentHistory: [],
    };
  }
  return {
    ...src,
    numberOfSessions: Number.isFinite(Number(src.numberOfSessions))
      ? Number(src.numberOfSessions)
      : 0,
    paymentHistory: normalizePaymentHistory(src),
  };
}

/**
 * Apply a session balance change and append payment history (if delta !== 0).
 */
export async function recordPaymentSessionChange(
  db,
  studentId,
  { delta, type, reason, lesson, by }
) {
  const student = await db.collection('students').findOne({ id: studentId });
  if (!student) return null;

  const payment = normalizeStudentPayment(student.payment);
  const prev = Number(payment.numberOfSessions) || 0;
  const change = Number(delta) || 0;
  const next = Math.max(0, prev + change);
  payment.numberOfSessions = next;

  if (change !== 0) {
    payment.paymentHistory = [
      buildPaymentHistoryEntry({
        type,
        delta: change,
        balanceAfter: next,
        reason,
        lesson: lesson || null,
        by: by || null,
      }),
      ...normalizePaymentHistory(payment),
    ].slice(0, 200);
  }

  await db.collection('students').updateOne(
    { id: studentId },
    { $set: { payment } }
  );

  return { balanceAfter: next, payment };
}
