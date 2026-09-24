/**
 * DevTools deterrence when DEVTOOLS_BLOCK=true.
 *
 * Detects docked DevTools via outer/inner window gaps (baseline-learned),
 * blocks shortcuts/context menu, shows overlay + 15s countdown, then logs out.
 * Skips: config off, phones/tablets (no desktop DevTools), developers, embed shells.
 * Public pages (e.g. / login): overlay only. Authenticated pages: overlay + 15s logout.
 */

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { classifyDevice } from '../lib/devtoolsProtection/classifyDevice';
import {
  shouldProtectCurrentRoute,
  isPublicPath,
} from '../lib/devtoolsProtection/routes';
import {
  createViewportDetector,
  measureWindowGaps,
} from '../lib/devtoolsProtection/detectViewport';

const IS_DEV = process.env.NODE_ENV === 'development';
const COUNTDOWN_SECONDS = 15;
const CHECK_INTERVAL_MS = 400;

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
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [devToolsDetected, setDevToolsDetected] = useState(false);
  const [timer, setTimer] = useState(COUNTDOWN_SECONDS);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const pathname = router?.pathname || '';
  const isPublicPage = isPublicPath(pathname);

  useEffect(() => {
    const info = classifyDevice();
    setDeviceInfo(info);
    logDiag({
      phase: 'device',
      deviceType: info.type,
      allowAggressiveDetection: info.allowAggressiveDetection,
      reason: info.reason,
    });
  }, []);

  const eligibility = useMemo(() => {
    if (devtoolsBlockEnabled !== true) {
      return {
        active: false,
        reason: devtoolsBlockEnabled === null ? 'config-loading' : 'config-disabled',
      };
    }
    if (!deviceInfo) return { active: false, reason: 'device-pending' };
    if (!deviceInfo.allowAggressiveDetection) {
      return {
        active: false,
        reason: `touch-or-ambiguous:${deviceInfo.reason}`,
      };
    }
    if (userRole === 'developer') {
      return { active: false, reason: 'developer-exempt' };
    }

    const route = shouldProtectCurrentRoute(pathname, userRole);
    if (!route.protect) return { active: false, reason: route.reason };

    // Public pages: protect immediately (don't wait for auth /me).
    // Private pages: wait until auth is ready so role is known.
    if (!route.soft && !authReady) {
      return { active: false, reason: 'auth-not-ready' };
    }

    return { active: true, soft: !!route.soft, reason: route.reason };
  }, [devtoolsBlockEnabled, authReady, deviceInfo, pathname, userRole]);

  useEffect(() => {
    logDiag({
      phase: 'eligibility',
      protectionEnabled: eligibility.active,
      reason: eligibility.reason,
      pathname,
      userRole,
      deviceType: deviceInfo?.type,
    });
    if (!eligibility.active) {
      setDevToolsDetected(false);
      setTimer(COUNTDOWN_SECONDS);
      setIsLoggingOut(false);
    }
  }, [eligibility, pathname, userRole, deviceInfo]);

  // Geometry + shortcut detection
  useEffect(() => {
    if (!eligibility.active || typeof window === 'undefined') {
      return undefined;
    }

    let rafId = 0;
    let lastCheck = 0;
    let detected = false;
    const detector = createViewportDetector();

    const detectDevTools = () => {
      const gaps = measureWindowGaps(window);
      if (!gaps) return;
      const next = detector.sample(gaps.widthGap, gaps.heightGap);
      if (next === detected) return;
      detected = next;
      setDevToolsDetected(next);
      logDiag({
        phase: 'viewport',
        detected: next,
        widthGap: Math.round(gaps.widthGap),
        heightGap: Math.round(gaps.heightGap),
      });
    };

    const continuousCheck = (timestamp) => {
      if (timestamp - lastCheck >= CHECK_INTERVAL_MS) {
        detectDevTools();
        lastCheck = timestamp;
      }
      rafId = requestAnimationFrame(continuousCheck);
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
        detectDevTools();
        setTimeout(() => detectDevTools(), 400);
        return false;
      }
      return undefined;
    };

    const handleResize = () => detectDevTools();

    rafId = requestAnimationFrame(continuousCheck);
    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('resize', handleResize);

    logDiag({ phase: 'listeners', action: 'attached' });

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('resize', handleResize);
      logDiag({ phase: 'listeners', action: 'detached' });
    };
  }, [eligibility.active]);

  // Countdown + logout (authenticated protected pages only)
  useEffect(() => {
    if (!eligibility.active || !devToolsDetected || isPublicPage) {
      setTimer(COUNTDOWN_SECONDS);
      setIsLoggingOut(false);
      return undefined;
    }

    let cancelled = false;
    let currentTime = COUNTDOWN_SECONDS;
    setTimer(COUNTDOWN_SECONDS);
    setIsLoggingOut(false);

    const logout = async () => {
      if (cancelled) return;
      setIsLoggingOut(true);
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'include',
        });
      } catch {
        /* continue cleanup */
      }

      try {
        document.cookie.split(';').forEach((c) => {
          const eqPos = c.indexOf('=');
          const name = eqPos > -1 ? c.slice(0, eqPos).trim() : c.trim();
          if (!name) return;
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`;
        });
      } catch {
        /* ignore */
      }

      try {
        localStorage.clear();
      } catch {
        /* ignore */
      }
      try {
        sessionStorage.clear();
      } catch {
        /* ignore */
      }

      if (!cancelled) {
        window.location.href = '/';
      }
    };

    const timerInterval = setInterval(() => {
      currentTime -= 1;
      if (cancelled) return;
      setTimer(currentTime);
      if (currentTime <= 0) {
        clearInterval(timerInterval);
        setTimer(0);
        logout();
      }
    }, 1000);

    const backupTimeout = setTimeout(() => {
      clearInterval(timerInterval);
      logout();
    }, COUNTDOWN_SECONDS * 1000);

    return () => {
      cancelled = true;
      clearInterval(timerInterval);
      clearTimeout(backupTimeout);
    };
  }, [eligibility.active, devToolsDetected, isPublicPage]);

  if (!eligibility.active || !devToolsDetected) {
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
          cursor: 'none',
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
          cursor: 'none',
          pointerEvents: 'auto',
          userSelect: 'none',
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div style={{ color: 'white', fontSize: '3rem' }}>🔒</div>
        <div
          className="devtools-message"
          style={{
            color: 'white',
            fontSize: '1.5rem',
            fontWeight: 'bold',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          {isPublicPage ? (
            <>Developer tools detected. Please close them to continue.</>
          ) : (
            <>
              Developer tools detected. Close them to continue or you&apos;ll be redirected to
              login in{' '}
              <span
                className="devtools-timer"
                style={{
                  color: '#1FA8DC',
                  fontSize: '1.8rem',
                  fontWeight: 'bold',
                }}
              >
                {timer.toString().padStart(2, '0')}
              </span>{' '}
              seconds.
            </>
          )}
        </div>
        {isLoggingOut ? (
          <div
            className="devtools-spinner"
            style={{
              width: '50px',
              height: '50px',
              border: '4px solid rgba(255, 255, 255, 0.3)',
              borderTop: '4px solid #1FA8DC',
              borderRadius: '50%',
              animation: 'devtools-spin 1s linear infinite',
              marginTop: '10px',
            }}
          />
        ) : null}
      </div>

      <style jsx global>{`
        @keyframes devtools-spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
        body {
          overflow: hidden !important;
        }
        [data-devtools-overlay],
        [data-devtools-message-container],
        [data-devtools-message-container] * {
          pointer-events: auto !important;
          cursor: none !important;
        }
      `}</style>
    </>
  );
}
