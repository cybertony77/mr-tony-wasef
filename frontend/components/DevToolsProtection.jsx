/**
 * Conservative DevTools deterrence (NOT a security boundary).
 *
 * - Fail open whenever uncertain (device, config, role, route, signals)
 * - Never use viewport outer/inner geometry as proof of DevTools
 * - Never logout / clear storage because of a heuristic
 * - Touch-first / ambiguous devices: no aggressive detection
 * - State machine: DISABLED → IDLE → SUSPECTED → CONFIRMED → WARNING
 *
 * Detection uses intentional keyboard signals only (F12 / Ctrl+Shift+I|J|C).
 * A single signal never warns; confirmation requires repeated intentional signals
 * with persistence. Warning clears when signals stop or the student continues.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import { classifyDevice } from '../lib/devtoolsProtection/classifyDevice';
import { shouldProtectCurrentRoute } from '../lib/devtoolsProtection/routes';

const STATES = {
  DISABLED: 'DISABLED',
  IDLE: 'IDLE',
  SUSPECTED: 'SUSPECTED',
  CONFIRMED: 'CONFIRMED',
  WARNING: 'WARNING',
};

const IS_DEV = process.env.NODE_ENV === 'development';

function logDiag(payload) {
  if (!IS_DEV) return;
  try {
    // eslint-disable-next-line no-console
    console.debug('[DevToolsProtection]', payload);
  } catch {
    /* ignore */
  }
}

function isDevToolsShortcut(e) {
  if (e.key === 'F12' || e.keyCode === 123) return true;
  if (e.ctrlKey && e.shiftKey) {
    const k = e.key;
    if (k === 'I' || k === 'i' || e.keyCode === 73) return true;
    if (k === 'J' || k === 'j' || e.keyCode === 74) return true;
    if (k === 'C' || k === 'c' || e.keyCode === 67) return true;
  }
  if (e.metaKey && e.altKey) {
    const k = e.key;
    if (k === 'I' || k === 'i' || k === 'J' || k === 'j' || k === 'C' || k === 'c') {
      return true;
    }
  }
  return false;
}

function isViewSourceShortcut(e) {
  return e.ctrlKey && (e.key === 'u' || e.key === 'U' || e.keyCode === 85);
}

/**
 * @param {{
 *   userRole: string | null,
 *   authReady: boolean,
 *   devtoolsBlockEnabled: boolean | null,
 * }} props
 */
export default function DevToolsProtection({
  userRole,
  authReady = false,
  devtoolsBlockEnabled = null,
}) {
  const router = useRouter();
  const [machineState, setMachineState] = useState(STATES.DISABLED);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [protectionActive, setProtectionActive] = useState(false);

  const signalTimestampsRef = useRef([]);
  const clearTimerRef = useRef(null);
  const layoutCooldownRef = useRef(0);
  const mountedRef = useRef(true);
  const machineStateRef = useRef(machineState);

  const pathname = router?.pathname || '';

  useEffect(() => {
    machineStateRef.current = machineState;
  }, [machineState]);

  const resetSignals = useCallback((next = STATES.IDLE) => {
    signalTimestampsRef.current = [];
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
    if (mountedRef.current) {
      setMachineState(next);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const info = classifyDevice();
    setDeviceInfo(info);
    logDiag({
      phase: 'device',
      deviceType: info.type,
      touch: info.touch,
      coarsePointer: info.coarsePointer,
      hoverNone: info.hoverNone,
      standalone: info.standalone,
      allowAggressiveDetection: info.allowAggressiveDetection,
      reason: info.reason,
    });
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const eligibility = useMemo(() => {
    if (devtoolsBlockEnabled !== true) {
      return {
        active: false,
        reason: devtoolsBlockEnabled === null ? 'config-loading' : 'config-disabled',
      };
    }
    if (!authReady) return { active: false, reason: 'auth-not-ready' };
    if (!deviceInfo) return { active: false, reason: 'device-pending' };
    if (!deviceInfo.allowAggressiveDetection) {
      return {
        active: false,
        reason: `touch-or-ambiguous:${deviceInfo.reason}`,
      };
    }
    const route = shouldProtectCurrentRoute(pathname, userRole);
    if (!route.protect) return { active: false, reason: route.reason };
    return { active: true, reason: route.reason };
  }, [devtoolsBlockEnabled, authReady, deviceInfo, pathname, userRole]);

  useEffect(() => {
    setProtectionActive(eligibility.active);
    if (!eligibility.active) {
      signalTimestampsRef.current = [];
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
      setMachineState(STATES.DISABLED);
    } else {
      setMachineState(STATES.IDLE);
      signalTimestampsRef.current = [];
    }
    logDiag({
      phase: 'eligibility',
      protectionEnabled: eligibility.active,
      reason: eligibility.reason,
      pathname,
      userRole,
      deviceType: deviceInfo?.type,
    });
  }, [eligibility, pathname, userRole, deviceInfo]);

  useEffect(() => {
    if (!protectionActive || typeof window === 'undefined') {
      return undefined;
    }

    const REQUIRED_FOR_SUSPECTED = 1;
    const REQUIRED_FOR_CONFIRMED = 2;
    const REQUIRED_FOR_WARNING = 3;
    const SIGNAL_WINDOW_MS = 12_000;
    const PERSIST_CLEAR_MS = 6_000;
    const LAYOUT_COOLDOWN_MS = 2_000;

    const scheduleClearIfQuiet = () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      clearTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        signalTimestampsRef.current = [];
        setMachineState(STATES.IDLE);
        logDiag({ phase: 'clear', state: STATES.IDLE, reason: 'signals-quiet' });
      }, PERSIST_CLEAR_MS);
    };

    const registerIntentionalSignal = (signal) => {
      if (Date.now() < layoutCooldownRef.current) {
        logDiag({ phase: 'signal-ignored', signal, reason: 'layout-cooldown' });
        return;
      }

      const now = Date.now();
      const recent = signalTimestampsRef.current.filter((t) => now - t < SIGNAL_WINDOW_MS);
      recent.push(now);
      signalTimestampsRef.current = recent;
      const count = recent.length;

      logDiag({
        phase: 'signal',
        signal,
        count,
        state: machineStateRef.current,
        confidence: Math.min(1, count / REQUIRED_FOR_WARNING),
      });

      if (count >= REQUIRED_FOR_WARNING) {
        setMachineState(STATES.WARNING);
      } else if (count >= REQUIRED_FOR_CONFIRMED) {
        setMachineState(STATES.CONFIRMED);
      } else if (count >= REQUIRED_FOR_SUSPECTED) {
        setMachineState(STATES.SUSPECTED);
      }
      scheduleClearIfQuiet();
    };

    const handleContextMenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };

    const handleKeyDown = (e) => {
      if (isDevToolsShortcut(e) || isViewSourceShortcut(e)) {
        e.preventDefault();
        e.stopPropagation();
        if (isDevToolsShortcut(e)) {
          registerIntentionalSignal(`shortcut:${e.key || e.keyCode}`);
        }
        return false;
      }
      return undefined;
    };

    const markLayoutChange = (reason) => {
      layoutCooldownRef.current = Date.now() + LAYOUT_COOLDOWN_MS;
      logDiag({ phase: 'layout', reason, action: 'cooldown' });
      setMachineState((prev) => {
        if (prev === STATES.SUSPECTED || prev === STATES.CONFIRMED) {
          signalTimestampsRef.current = [];
          return STATES.IDLE;
        }
        // WARNING: do not hard-lock; treat layout change as uncertainty → fail open
        if (prev === STATES.WARNING) {
          signalTimestampsRef.current = [];
          return STATES.IDLE;
        }
        return prev;
      });
    };

    const handleResize = () => markLayoutChange('resize');
    const handleOrientation = () => markLayoutChange('orientationchange');
    const handleVisibility = () => markLayoutChange('visibilitychange');
    const handleFullscreen = () => markLayoutChange('fullscreenchange');

    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientation);
    document.addEventListener('visibilitychange', handleVisibility);
    document.addEventListener('fullscreenchange', handleFullscreen);

    logDiag({ phase: 'listeners', action: 'attached' });

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientation);
      document.removeEventListener('visibilitychange', handleVisibility);
      document.removeEventListener('fullscreenchange', handleFullscreen);
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
      logDiag({ phase: 'listeners', action: 'detached' });
    };
  }, [protectionActive]);

  const dismissWarning = () => {
    resetSignals(STATES.IDLE);
    logDiag({ phase: 'dismiss', reason: 'user-continue' });
  };

  if (machineState !== STATES.WARNING) {
    return null;
  }

  return (
    <>
      <div
        data-devtools-overlay
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          zIndex: 99999,
          pointerEvents: 'auto',
        }}
        onContextMenu={(e) => e.preventDefault()}
      />

      <div
        data-devtools-message-container
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 100000,
          backgroundColor: '#000000',
          borderRadius: '20px',
          padding: '40px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.9)',
          border: '2px solid rgba(255, 255, 255, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '20px',
          minWidth: 'min(400px, 92vw)',
          maxWidth: '90%',
          pointerEvents: 'auto',
          userSelect: 'none',
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div style={{ color: 'white', fontSize: '3rem' }}>🔒</div>
        <div
          style={{
            color: 'white',
            fontSize: '1.35rem',
            fontWeight: 'bold',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          Developer tools detected. Please close them to continue.
        </div>
        <p
          style={{
            color: 'rgba(255,255,255,0.75)',
            fontSize: '0.95rem',
            textAlign: 'center',
            margin: 0,
            maxWidth: 420,
            lineHeight: 1.4,
          }}
        >
          If you did not open Developer Tools, tap Continue — this check never signs you out.
        </p>
        <button
          type="button"
          onClick={dismissWarning}
          style={{
            marginTop: 8,
            padding: '12px 28px',
            borderRadius: 10,
            border: 'none',
            background: '#1FA8DC',
            color: '#fff',
            fontWeight: 700,
            fontSize: '1rem',
            cursor: 'pointer',
          }}
        >
          Continue
        </button>
      </div>

      <style jsx global>{`
        body {
          overflow: hidden !important;
        }
      `}</style>
    </>
  );
}
