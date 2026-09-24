/**
 * Docked DevTools change the gap between the browser window and the page.
 * The resting gap is browser chrome (tabs, address bar, bookmarks, scrollbar)
 * and, on scaled Windows displays, a DPI mismatch between outer and inner size.
 * Those resting gaps must not count as DevTools.
 *
 * A real dock enlarges one axis. Zoom and DPI scaling enlarge both together,
 * so one-axis growth is the signal.
 */

export const OPEN_DELTA = 200;
export const CLOSE_DELTA = 100;
export const REQUIRED_DETECTIONS = 3;
export const BASELINE_SAMPLES_NEEDED = 4;

// Resting width is a scrollbar and window border (well under 80px).
const SIDE_DOCK_WIDTH = 200;
// Resting height is toolbars. Stacked bars can pass 200px; a dock is larger.
const BOTTOM_DOCK_HEIGHT = 360;
const QUIET_WIDTH = 80;
const QUIET_HEIGHT = 260;

function isSideDock(widthGap, heightGap) {
  return widthGap > SIDE_DOCK_WIDTH && heightGap < QUIET_HEIGHT;
}

function isBottomDock(widthGap, heightGap) {
  return heightGap > BOTTOM_DOCK_HEIGHT && widthGap < QUIET_WIDTH;
}

/**
 * outer* and inner* are both CSS pixels in current Chrome, except some Windows
 * scaled displays still report outer* in physical pixels. That makes both gaps
 * huge and looks like DevTools. Unscale only when both axes agree.
 *
 * @param {{
 *   outerWidth: number,
 *   outerHeight: number,
 *   innerWidth: number,
 *   innerHeight: number,
 *   devicePixelRatio?: number,
 *   screenWidth?: number,
 *   screenHeight?: number,
 * }} metrics
 * @returns {{ widthGap: number, heightGap: number } | null}
 */
export function measureGaps(metrics) {
  const {
    outerWidth,
    outerHeight,
    innerWidth,
    innerHeight,
    devicePixelRatio = 1,
    screenWidth = 0,
    screenHeight = 0,
  } = metrics || {};

  if (!(outerWidth > 0 && outerHeight > 0 && innerWidth > 0 && innerHeight > 0)) {
    return null;
  }

  let outerW = outerWidth;
  let outerH = outerHeight;
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;

  if (dpr > 1.05) {
    const widthPhysical = screenWidth > 0 && outerW > screenWidth + 16;
    const heightPhysical = screenHeight > 0 && outerH > screenHeight + 16;
    const widthRatio = outerW / innerWidth;
    const heightRatio = outerH / innerHeight;
    const nearDpr = (ratio) => Math.abs(ratio - dpr) <= dpr * 0.12;
    const similarAxes = Math.abs(widthRatio - heightRatio) <= dpr * 0.08;
    if ((widthPhysical && heightPhysical) || (nearDpr(widthRatio) && nearDpr(heightRatio) && similarAxes)) {
      outerW /= dpr;
      outerH /= dpr;
    }
  }

  return {
    widthGap: Math.max(0, outerW - innerWidth),
    heightGap: Math.max(0, outerH - innerHeight),
  };
}

export function measureWindowGaps(win) {
  if (!win) return null;
  return measureGaps({
    outerWidth: win.outerWidth,
    outerHeight: win.outerHeight,
    innerWidth: win.innerWidth,
    innerHeight: win.innerHeight,
    devicePixelRatio: win.devicePixelRatio,
    screenWidth: win.screen && win.screen.width,
    screenHeight: win.screen && win.screen.height,
  });
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Samples viewport gaps over time. Returns whether docked DevTools are open.
 * The first quiet samples become the baseline; later one-axis growth is a dock.
 */
export function createViewportDetector() {
  let baselineWidth = null;
  let baselineHeight = null;
  let baselineSamples = 0;
  const widthSamples = [];
  const heightSamples = [];
  let detectionCount = 0;
  let clearCount = 0;
  let detected = false;

  function markOpen() {
    clearCount = 0;
    detectionCount += 1;
    if (detectionCount >= REQUIRED_DETECTIONS) {
      detected = true;
      detectionCount = REQUIRED_DETECTIONS;
    }
  }

  return {
    sample(widthGap, heightGap) {
      if (!Number.isFinite(widthGap) || !Number.isFinite(heightGap)) return detected;

      const dockedNow = isSideDock(widthGap, heightGap) || isBottomDock(widthGap, heightGap);

      if (baselineWidth === null || baselineSamples < BASELINE_SAMPLES_NEEDED) {
        if (dockedNow) {
          markOpen();
          return detected;
        }
        widthSamples.push(widthGap);
        heightSamples.push(heightGap);
        baselineSamples += 1;
        baselineWidth = median(widthSamples);
        baselineHeight = median(heightSamples);
        detectionCount = 0;
        clearCount = 0;
        detected = false;
        return detected;
      }

      const widthIncrease = widthGap - baselineWidth;
      const heightIncrease = heightGap - baselineHeight;
      const oneAxisGrowth =
        (widthIncrease > OPEN_DELTA && heightIncrease < OPEN_DELTA) ||
        (heightIncrease > OPEN_DELTA && widthIncrease < OPEN_DELTA);

      if (dockedNow || oneAxisGrowth) {
        markOpen();
        return detected;
      }

      const settled = widthIncrease < CLOSE_DELTA && heightIncrease < CLOSE_DELTA;
      if (settled) {
        detectionCount = 0;
        clearCount += 1;
        if (clearCount >= 2) {
          detected = false;
          baselineWidth = widthGap;
          baselineHeight = heightGap;
        }
      }
      return detected;
    },
  };
}
