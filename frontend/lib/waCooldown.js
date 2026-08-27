import { useState, useEffect, useRef, useCallback } from 'react';

export const WA_COOLDOWN_SECONDS = 15;
const STORAGE_PREFIX = 'wa_send_cooldown_';

function storageKey(senderId, scope = 'default') {
  return `${STORAGE_PREFIX}${scope}_${senderId || 'anonymous'}`;
}

function persist(senderId, endsAt, targetId, scope) {
  try {
    sessionStorage.setItem(
      storageKey(senderId, scope),
      JSON.stringify({ endsAt, studentId: targetId ?? null })
    );
  } catch {
    // ignore
  }
}

function clearPersist(senderId, scope) {
  try {
    sessionStorage.removeItem(storageKey(senderId, scope));
  } catch {
    // ignore
  }
}

function readPersist(senderId, scope) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(storageKey(senderId, scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const endsAt = Number(parsed.endsAt) || 0;
    const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    if (left <= 0) {
      clearPersist(senderId, scope);
      return null;
    }
    return { left, endsAt, studentId: parsed.studentId ?? null };
  } catch {
    return null;
  }
}

/**
 * Device-local cooldown for the current sender account only.
 * Other devices / accounts are unaffected.
 */
export function useWaCooldown(senderId, scope = 'default') {
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [cooldownStudentId, setCooldownStudentId] = useState(null);
  const timerRef = useRef(null);
  const endsAtRef = useRef(0);
  const targetRef = useRef(null);
  const senderIdRef = useRef(senderId);
  senderIdRef.current = senderId;

  const clearTimer = () => {
    if (timerRef.current != null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const runTicker = useCallback(() => {
    clearTimer();
    timerRef.current = setInterval(() => {
      const left = Math.max(0, Math.ceil((endsAtRef.current - Date.now()) / 1000));
      if (left <= 0) {
        clearTimer();
        endsAtRef.current = 0;
        targetRef.current = null;
        setCooldownLeft(0);
        setCooldownStudentId(null);
        clearPersist(senderIdRef.current || 'anonymous', scope);
        clearPersist('anonymous', scope);
        return;
      }
      setCooldownLeft(left);
      setCooldownStudentId(targetRef.current);
    }, 250);
  }, [scope]);

  // Restore on mount
  useEffect(() => {
    const key = senderId || 'anonymous';
    const saved = readPersist(key, scope) || (key !== 'anonymous' ? readPersist('anonymous', scope) : null);
    if (!saved) return undefined;

    if (key !== 'anonymous' && readPersist('anonymous', scope)) {
      persist(key, saved.endsAt, saved.studentId, scope);
      clearPersist('anonymous', scope);
    }

    endsAtRef.current = saved.endsAt;
    targetRef.current = saved.studentId;
    setCooldownLeft(saved.left);
    setCooldownStudentId(saved.studentId);
    runTicker();

    return () => clearTimer();
    // restore once per scope on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  // Migrate anonymous → real sender id when profile loads (do not reset active timer)
  useEffect(() => {
    if (!senderId) return;
    if (endsAtRef.current > Date.now()) {
      persist(senderId, endsAtRef.current, targetRef.current, scope);
      clearPersist('anonymous', scope);
      return;
    }
    const anon = readPersist('anonymous', scope);
    if (!anon) return;
    persist(senderId, anon.endsAt, anon.studentId, scope);
    clearPersist('anonymous', scope);
    endsAtRef.current = anon.endsAt;
    targetRef.current = anon.studentId;
    setCooldownLeft(anon.left);
    setCooldownStudentId(anon.studentId);
    runTicker();
  }, [senderId, scope, runTicker]);

  const startCooldown = useCallback((targetId = null) => {
    const key = senderIdRef.current || 'anonymous';
    const endsAt = Date.now() + WA_COOLDOWN_SECONDS * 1000;
    endsAtRef.current = endsAt;
    targetRef.current = targetId ?? null;
    persist(key, endsAt, targetId, scope);
    setCooldownStudentId(targetId ?? null);
    setCooldownLeft(WA_COOLDOWN_SECONDS);
    runTicker();
  }, [scope, runTicker]);

  useEffect(() => () => clearTimer(), []);

  return {
    cooldownLeft,
    cooldownStudentId,
    startCooldown,
    isCoolingDown: cooldownLeft > 0,
  };
}
