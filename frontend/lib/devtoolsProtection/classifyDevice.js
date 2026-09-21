/**
 * Device / input capability classification for DevTools deterrence.
 * Prefer capability signals over UA. Ambiguous → fail open (no aggressive detection).
 */

const DESKTOP = 'desktop';
const TOUCH_FIRST = 'touch-first';
const AMBIGUOUS = 'ambiguous';

function mediaMatches(query) {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return null;
    }
    return window.matchMedia(query).matches;
  } catch {
    return null;
  }
}

/**
 * @returns {{
 *   type: 'desktop' | 'touch-first' | 'ambiguous',
 *   touch: boolean,
 *   maxTouchPoints: number,
 *   coarsePointer: boolean | null,
 *   hoverNone: boolean | null,
 *   standalone: boolean,
 *   allowAggressiveDetection: boolean,
 *   reason: string,
 * }}
 */
export function classifyDevice() {
  if (typeof window === 'undefined') {
    return {
      type: AMBIGUOUS,
      touch: false,
      maxTouchPoints: 0,
      coarsePointer: null,
      hoverNone: null,
      standalone: false,
      allowAggressiveDetection: false,
      reason: 'ssr',
    };
  }

  const maxTouchPoints = Number(navigator.maxTouchPoints) || 0;
  const hasTouchEvent = 'ontouchstart' in window;
  const touch = hasTouchEvent || maxTouchPoints > 0;
  const coarsePointer = mediaMatches('(pointer: coarse)');
  const hoverNone = mediaMatches('(hover: none)');
  const finePointer = mediaMatches('(pointer: fine)');
  const canHover = mediaMatches('(hover: hover)');

  let standalone = false;
  try {
    standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari PWA
      (typeof navigator !== 'undefined' && navigator.standalone === true);
  } catch {
    standalone = false;
  }

  const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';
  // iPadOS 13+ often reports as Macintosh + touch
  const iPadDesktopUa =
    /Macintosh/i.test(ua) && maxTouchPoints > 1;
  const classicMobileUa =
    /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i.test(ua);
  const tabletUa = /iPad|Tablet|Android(?!.*Mobile)/i.test(ua);

  const screenMin = Math.min(
    Number(window.screen?.width) || 0,
    Number(window.screen?.height) || 0
  );
  const smallTouchScreen = touch && screenMin > 0 && screenMin < 768;

  // Phones / tablets / touch-first devices: no DevTools overlay (they don't have desktop DevTools)
  if (
    iPadDesktopUa ||
    tabletUa ||
    classicMobileUa ||
    smallTouchScreen ||
    (touch && coarsePointer === true) ||
    (touch && hoverNone === true && finePointer === false) ||
    (standalone && touch)
  ) {
    return {
      type: TOUCH_FIRST,
      touch,
      maxTouchPoints,
      coarsePointer,
      hoverNone,
      standalone,
      allowAggressiveDetection: false,
      reason: iPadDesktopUa
        ? 'ipad-desktop-ua'
        : tabletUa
          ? 'tablet-ua'
          : classicMobileUa
            ? 'touch-mobile-ua'
            : smallTouchScreen
              ? 'small-touch-screen'
              : standalone && touch
                ? 'pwa-touch'
                : coarsePointer
                  ? 'coarse-pointer'
                  : 'hover-none',
    };
  }

  // Clear desktop: fine pointer + hover, little/no touch
  if (
    !touch &&
    (finePointer === true || finePointer === null) &&
    (canHover === true || canHover === null) &&
    coarsePointer !== true
  ) {
    return {
      type: DESKTOP,
      touch,
      maxTouchPoints,
      coarsePointer,
      hoverNone,
      standalone,
      allowAggressiveDetection: true,
      reason: 'desktop-capabilities',
    };
  }

  // Touch-enabled Windows / hybrid laptops with a real mouse/trackpad:
  // still allow DevTools detection (common desktop Chrome setup).
  if (touch && (finePointer === true || canHover === true) && coarsePointer !== true) {
    return {
      type: DESKTOP,
      touch,
      maxTouchPoints,
      coarsePointer,
      hoverNone,
      standalone,
      allowAggressiveDetection: true,
      reason: 'hybrid-fine-pointer-desktop',
    };
  }

  // Coarse hybrid / unclear touch laptops → fail open
  if (touch && (finePointer === true || canHover === true)) {
    return {
      type: AMBIGUOUS,
      touch,
      maxTouchPoints,
      coarsePointer,
      hoverNone,
      standalone,
      allowAggressiveDetection: false,
      reason: 'hybrid-touch-desktop',
    };
  }

  // Anything else unknown → fail open
  return {
    type: AMBIGUOUS,
    touch,
    maxTouchPoints,
    coarsePointer,
    hoverNone,
    standalone,
    allowAggressiveDetection: false,
    reason: 'unknown-device',
  };
}

export const DEVICE_TYPES = { DESKTOP, TOUCH_FIRST, AMBIGUOUS };
