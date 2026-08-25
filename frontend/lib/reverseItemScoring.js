import { applyScoringEvent, SYSTEM_SCORING_SYSTEM } from '../pages/api/scoring/calculate';

function parsePercentage(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = parseInt(String(value).replace('%', '').trim(), 10);
  return Number.isNaN(n) ? null : n;
}

function buildStateKey(studentId, type, sourceKind, sourceId) {
  const rawKey = `student:${studentId}|type:${type}|kind:${sourceKind}|id:${sourceId}`;
  return Buffer.from(rawKey, 'utf8').toString('hex');
}

export async function reverseItemScoring(db, {
  studentId,
  type,
  lesson,
  sourceKind,
  sourceId,
  sourceLabel,
  previousPercentage,
  previousHwDone,
  fallbackPoints,
}) {
  if (!SYSTEM_SCORING_SYSTEM) return null;
  if (!studentId || !type || !sourceKind || !sourceId) return null;

  const student = await db.collection('students').findOne(
    { id: parseInt(studentId) },
    { projection: { scoring_state: 1 } }
  );
  const stateKey = buildStateKey(parseInt(studentId), type, String(sourceKind), String(sourceId));
  const existing = student?.scoring_state?.[stateKey];
  const awarded = Number(existing?.awarded_total_points || 0);

  if (existing && awarded !== 0) {
    try {
      return await applyScoringEvent({
        db,
        studentId,
        type,
        lesson: lesson || existing.lesson || null,
        data: {
          reverseOnly: true,
          percentage: previousPercentage ?? existing.current_result?.percentage ?? null,
          previousPercentage: previousPercentage ?? existing.current_result?.percentage ?? null,
          previousHwDone: previousHwDone ?? existing.current_result?.hwDone ?? null,
          autoReversedBy: 'preview_reset',
        },
        sourceInput: {
          kind: sourceKind,
          id: String(sourceId),
          label: sourceLabel || existing.source_label || lesson || String(sourceId),
        },
        skipAttendanceAutoReverse: true,
      });
    } catch (error) {
      console.error('[SCORING] Failed to reverse item on reset:', {
        studentId,
        type,
        sourceKind,
        sourceId,
        error: error?.message || error,
      });
      return null;
    }
  }

  const fallback = Number(fallbackPoints);
  if (!fallback) return null;

  try {
    return await applyScoringEvent({
      db,
      studentId,
      type: 'manual',
      lesson: lesson || null,
      data: {
        delta: -fallback,
        reason: `Preview reset reversed saved points for ${type}`,
      },
      sourceInput: {
        kind: 'preview_reset',
        id: `${type}:${sourceId}`,
        label: sourceLabel || lesson || String(sourceId),
      },
      skipAttendanceAutoReverse: true,
    });
  } catch (error) {
    console.error('[SCORING] Failed fallback reverse on reset:', error);
    return null;
  }
}

export { parsePercentage };
