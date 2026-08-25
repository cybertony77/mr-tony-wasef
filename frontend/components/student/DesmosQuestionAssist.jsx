import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { createPortal } from 'react-dom';
import { useSystemConfig } from '../../lib/api/system';
import {
  createDesmosCalculator,
  DESMOS_CALC_TYPES,
  labelDesmosIframes,
  loadDesmosApi,
} from '../../lib/desmosApi';
import { isDesmosEnabledForQuestion } from '../online/UseDesmosInQuestionRadio';
import { useDesmosAssistGroup } from './DesmosAssistGroup';
import styles from '../../styles/DesmosQuestionAssist.module.css';

function isFeatureEnabled(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function useIsCompactLayout(breakpoint = 1024) {
  const [compact, setCompact] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const sync = () => setCompact(mq.matches);
    sync();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', sync);
      return () => mq.removeEventListener('change', sync);
    }
    mq.addListener(sync);
    return () => mq.removeListener(sync);
  }, [breakpoint]);

  return compact;
}

function TypeIcon({ type, className }) {
  switch (type) {
    case 'graphing':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 16c3-6 5-8 8-8s5 2 8 8" stroke="#ea4335" strokeWidth="2" strokeLinecap="round" />
          <path d="M4 18h16" stroke="#9aa0a6" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    case 'scientific':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="5" y="4" width="14" height="16" rx="2" stroke="#4285F4" strokeWidth="1.7" />
          <path d="M8 8h8M8 12h3M13 12h3M8 16h3M13 16h3" stroke="#4285F4" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'four_function':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 6v12M6 12h12" stroke="#9aa0a6" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case 'matrix':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M7 5v14M17 5v14" stroke="#9aa0a6" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M10 17V9" stroke="#00AC47" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M12.5 17v-5" stroke="#FBBC05" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M15 17V7" stroke="#ea4335" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case 'geometry':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M6 18V8l10 10H6z" stroke="#FBBC05" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M6 18h12" stroke="#FBBC05" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case '3d':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="5" y="5" width="14" height="14" rx="3" stroke="#4285F4" strokeWidth="1.7" />
          <text x="12" y="15.5" textAnchor="middle" fill="#4285F4" fontSize="9" fontWeight="700">
            3
          </text>
        </svg>
      );
    default:
      return null;
  }
}

function CalculatorTypeSelect({ value, onChange, disabled }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = DESMOS_CALC_TYPES.find((t) => t.id === value) || DESMOS_CALC_TYPES[0];

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <div className={styles.typeSelect} ref={rootRef} data-desmos-type-select="true">
      <button
        type="button"
        className={styles.typeTrigger}
        aria-haspopup="listbox"
        aria-expanded={menuOpen}
        disabled={disabled}
        onClick={() => setMenuOpen((v) => !v)}
      >
        <TypeIcon type={selected.id} className={styles.typeIcon} />
        <span className={styles.typeTriggerLabel}>{selected.label}</span>
        <svg className={styles.typeChevron} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {menuOpen ? (
        <div className={styles.typeMenu} role="listbox" aria-label="Select Calculator">
          <div className={styles.typeMenuTitle}>Select Calculator</div>
          {DESMOS_CALC_TYPES.map((opt) => {
            const active = opt.id === selected.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="option"
                aria-selected={active}
                className={`${styles.typeOption} ${active ? styles.typeOptionActive : ''}`}
                onClick={() => {
                  onChange(opt.id);
                  setMenuOpen(false);
                }}
              >
                <span className={styles.typeCheck} aria-hidden>
                  {active ? '✓' : ''}
                </span>
                <TypeIcon type={opt.id} className={styles.typeIcon} />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Premium Desmos assist for student question cards.
 * Close/hide keeps calculator state; reset only on next/previous (instanceKey change).
 * Type changes recreate the calculator for the selected tool.
 */
export default function DesmosQuestionAssist({
  useDesmos = false,
  instanceKey = 'desmos',
  children,
}) {
  const { data: systemConfig } = useSystemConfig();
  // SYSTEM_DESMOS_INTEGRATIONS (exposed as desmos_integrations)
  const featureOn = isFeatureEnabled(systemConfig?.desmos_integrations);
  const apiKey = String(systemConfig?.desmos_api_key || '').trim();
  const questionWantsDesmos = isDesmosEnabledForQuestion(useDesmos);
  // Both required: use_desmos=true AND SYSTEM_DESMOS_INTEGRATIONS=true (plus API key).
  // If use_desmos is true but the system flag is off, do not show the button.
  const show = questionWantsDesmos && featureOn && Boolean(apiKey);
  const group = useDesmosAssistGroup();
  const isCompact = useIsCompactLayout(1024);
  const reactId = useId();
  const panelId = `desmos-panel-${String(instanceKey).replace(/[^a-zA-Z0-9_-]/g, '-')}-${reactId}`;
  const claimOpen = group?.claimOpen;
  const releaseOpen = group?.releaseOpen;
  const setGroupPanelWidth = group?.setPanelWidth;
  const blockedByOther = Boolean(group?.isBlocked?.('desmos', instanceKey));
  // Inside a group, the group owns the desktop push layout for the whole page
  const useExternalLayout = Boolean(group);

  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [calcType, setCalcType] = useState('graphing');
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [portalReady, setPortalReady] = useState(false);
  const [dragPos, setDragPos] = useState(null); // { left, top } desktop only
  const [panelSize, setPanelSize] = useState(null); // { width, height } desktop only
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const hostRef = useRef(null);
  const calcRef = useRef(null);
  const panelRef = useRef(null);
  const mountedTypeRef = useRef(null);
  const dragRef = useRef(null);
  const resizeRef = useRef(null);
  const defaultSizeRef = useRef(null); // desktop natural size — resize may only grow width from this

  const destroyCalculator = useCallback(() => {
    try {
      calcRef.current?.destroy?.();
    } catch {
      // ignore
    }
    calcRef.current = null;
    mountedTypeRef.current = null;
    if (hostRef.current) {
      hostRef.current.innerHTML = '';
    }
  }, []);

  const resizeCalculator = useCallback(() => {
    requestAnimationFrame(() => {
      try {
        calcRef.current?.resize?.();
      } catch {
        // ignore
      }
    });
  }, []);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  // Reset only when question changes (next / previous)
  useEffect(() => {
    setOpen(false);
    setEverOpened(false);
    setCalcType('graphing');
    setStatus('idle');
    setErrorMsg('');
    setDragPos(null);
    setPanelSize(null);
    setIsDragging(false);
    setIsResizing(false);
    dragRef.current = null;
    resizeRef.current = null;
    defaultSizeRef.current = null;
    destroyCalculator();
  }, [instanceKey, destroyCalculator]);

  // Clear custom drag/size when leaving desktop
  useEffect(() => {
    if (isCompact) {
      setDragPos(null);
      setPanelSize(null);
      setIsDragging(false);
      setIsResizing(false);
      dragRef.current = null;
      resizeRef.current = null;
      defaultSizeRef.current = null;
    }
  }, [isCompact]);

  // Capture default docked size once (resize width cannot go below this)
  useEffect(() => {
    if (!open || isCompact || defaultSizeRef.current || !panelRef.current) return undefined;
    const id = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel || defaultSizeRef.current) return;
      const rect = panel.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        defaultSizeRef.current = {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      }
    });
    return () => cancelAnimationFrame(id);
  }, [open, isCompact, everOpened]);

  useEffect(() => () => destroyCalculator(), [destroyCalculator]);

  useEffect(() => {
    if (open) setEverOpened(true);
  }, [open]);

  // Exclusive open: only one Desmos in a group at a time
  useEffect(() => {
    if (!claimOpen || !releaseOpen) return undefined;
    if (open) {
      claimOpen('desmos', instanceKey);
      return () => releaseOpen('desmos', instanceKey);
    }
    releaseOpen('desmos', instanceKey);
    return undefined;
  }, [claimOpen, releaseOpen, open, instanceKey]);

  useEffect(() => {
    if (!blockedByOther || !open) return;
    setOpen(false);
  }, [blockedByOther, open]);

  // Keep group spacer in sync with docked / resized panel width
  useEffect(() => {
    if (!setGroupPanelWidth || !open || isCompact) return undefined;
    const w =
      panelSize?.width ||
      defaultSizeRef.current?.width ||
      panelRef.current?.getBoundingClientRect?.()?.width ||
      420;
    setGroupPanelWidth(w);
    return undefined;
  }, [setGroupPanelWidth, open, isCompact, panelSize]);

  const FALLBACK_MIN_W = 420;
  const MIN_PANEL_H = 280;

  const clampDragPosition = useCallback((left, top, width, height) => {
    const maxLeft = Math.max(0, window.innerWidth - width);
    const maxTop = Math.max(0, window.innerHeight - height);
    return {
      left: Math.min(Math.max(0, left), maxLeft),
      top: Math.min(Math.max(0, top), maxTop),
    };
  }, []);

  const clampPanelSize = useCallback((width, height) => {
    // Width: only allow growing from the default docked size (never smaller)
    const minW = defaultSizeRef.current?.width ?? FALLBACK_MIN_W;
    const maxW = Math.max(minW, window.innerWidth - 16);
    const maxH = Math.max(MIN_PANEL_H, window.innerHeight - 16);
    return {
      width: Math.min(Math.max(minW, width), maxW),
      height: Math.min(Math.max(MIN_PANEL_H, height), maxH),
    };
  }, []);

  const onDesktopDragStart = useCallback(
    (event) => {
      if (isCompact || isResizing || event.button !== 0) return;
      const interactive = event.target.closest(
        'button, a, input, select, textarea, [role="listbox"], [role="option"], [data-desmos-type-select], [data-desmos-resize]'
      );
      if (interactive) return;

      const panel = panelRef.current;
      if (!panel) return;

      const rect = panel.getBoundingClientRect();
      dragRef.current = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        width: rect.width,
        height: rect.height,
      };
      setDragPos({ left: rect.left, top: rect.top });
      if (!panelSize) {
        setPanelSize({ width: rect.width, height: rect.height });
      }
      setIsDragging(true);
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // ignore
      }
      event.preventDefault();
    },
    [isCompact, isResizing, panelSize]
  );

  const onDesktopDragMove = useCallback(
    (event) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const next = clampDragPosition(
        event.clientX - drag.offsetX,
        event.clientY - drag.offsetY,
        drag.width,
        drag.height
      );
      setDragPos(next);
    },
    [clampDragPosition]
  );

  const onDesktopDragEnd = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || (event?.pointerId != null && drag.pointerId !== event.pointerId)) return;
    dragRef.current = null;
    setIsDragging(false);
    try {
      if (event?.pointerId != null) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // ignore
    }
  }, []);

  const onDesktopResizeStart = useCallback(
    (edge) => (event) => {
      if (isCompact || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      const panel = panelRef.current;
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      if (!defaultSizeRef.current && rect.width > 0 && rect.height > 0) {
        defaultSizeRef.current = {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      }

      resizeRef.current = {
        pointerId: event.pointerId,
        edge,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: rect.left,
        startTop: rect.top,
        startW: rect.width,
        startH: rect.height,
      };
      setDragPos({ left: rect.left, top: rect.top });
      setPanelSize({ width: rect.width, height: rect.height });
      setIsResizing(true);
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // ignore
      }
    },
    [isCompact]
  );

  const onDesktopResizeMove = useCallback(
    (event) => {
      const resize = resizeRef.current;
      if (!resize || resize.pointerId !== event.pointerId) return;

      const dx = event.clientX - resize.startX;
      const dy = event.clientY - resize.startY;
      const edge = resize.edge;

      let left = resize.startLeft;
      let top = resize.startTop;
      let width = resize.startW;
      let height = resize.startH;

      if (edge.includes('e')) width = resize.startW + dx;
      if (edge.includes('s')) height = resize.startH + dy;
      if (edge.includes('w')) {
        width = resize.startW - dx;
        left = resize.startLeft + dx;
      }
      if (edge.includes('n')) {
        height = resize.startH - dy;
        top = resize.startTop + dy;
      }

      const sized = clampPanelSize(width, height);

      // Keep the opposite edge anchored when clamped
      if (edge.includes('w')) {
        left = resize.startLeft + (resize.startW - sized.width);
      }
      if (edge.includes('n')) {
        top = resize.startTop + (resize.startH - sized.height);
      }

      const pos = clampDragPosition(left, top, sized.width, sized.height);
      setPanelSize(sized);
      setDragPos(pos);
      resizeCalculator();
    },
    [clampPanelSize, clampDragPosition, resizeCalculator]
  );

  const onDesktopResizeEnd = useCallback(
    (event) => {
      const resize = resizeRef.current;
      if (!resize || (event?.pointerId != null && resize.pointerId !== event.pointerId)) return;
      resizeRef.current = null;
      setIsResizing(false);
      try {
        if (event?.pointerId != null) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        // ignore
      }
      resizeCalculator();
    },
    [resizeCalculator]
  );

  // Keep dragged/resized panel on-screen when the viewport resizes
  useEffect(() => {
    if ((!dragPos && !panelSize) || isCompact) return undefined;
    const onResize = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      setPanelSize((prev) => {
        if (!prev) return prev;
        return clampPanelSize(prev.width, prev.height);
      });
      setDragPos((prev) => {
        if (!prev) return prev;
        const w = panelSize?.width || rect.width;
        const h = panelSize?.height || rect.height;
        return clampDragPosition(prev.left, prev.top, w, h);
      });
      resizeCalculator();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [
    dragPos,
    panelSize,
    isCompact,
    clampDragPosition,
    clampPanelSize,
    resizeCalculator,
  ]);

  useEffect(() => {
    if (!open || !isCompact || typeof document === 'undefined') return undefined;
    const body = document.body;
    const html = document.documentElement;
    const prevBody = body.style.overflow;
    const prevHtml = html.style.overflow;
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
    return () => {
      body.style.overflow = prevBody;
      html.style.overflow = prevHtml;
    };
  }, [open, isCompact]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Mount / switch calculator type. Hide must not destroy; type change recreates.
  useEffect(() => {
    if (!everOpened || !show) return undefined;

    let cancelled = false;
    let iframeTimer = null;

    const ensureMounted = async () => {
      try {
        if (calcRef.current && mountedTypeRef.current === calcType) {
          setStatus('ready');
          resizeCalculator();
          labelDesmosIframes(hostRef.current, 'Desmos Calculator');
          return;
        }

        setStatus('loading');
        setErrorMsg('');

        // Shared calculator.js once — never geometry.js
        const Desmos = await loadDesmosApi(apiKey);
        if (cancelled) return;

        await new Promise((r) => requestAnimationFrame(r));
        if (cancelled) return;

        const el = hostRef.current;
        if (!el) return;

        // Always destroy previous instance before creating a new type
        destroyCalculator();
        el.innerHTML = '';

        calcRef.current = createDesmosCalculator(Desmos, el, calcType);
        mountedTypeRef.current = calcType;
        setStatus('ready');
        resizeCalculator();
        labelDesmosIframes(el, 'Desmos Calculator');
        // Desmos may inject iframe slightly after construct
        iframeTimer = window.setTimeout(() => {
          if (!cancelled) labelDesmosIframes(el, 'Desmos Calculator');
        }, 250);
      } catch (err) {
        if (cancelled) return;
        destroyCalculator();
        setStatus('error');
        setErrorMsg(err?.message || 'Could not open Desmos');
      }
    };

    ensureMounted();
    return () => {
      cancelled = true;
      if (iframeTimer) window.clearTimeout(iframeTimer);
    };
  }, [everOpened, show, apiKey, instanceKey, calcType, destroyCalculator, resizeCalculator]);

  useEffect(() => {
    if (!open || status !== 'ready') return undefined;
    resizeCalculator();
    const onResize = () => resizeCalculator();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open, status, isCompact, resizeCalculator]);

  const calculatorButton = useMemo(() => {
    if (!show) return null;
    const disabled = open || blockedByOther;
    return (
      <button
        type="button"
        className={`${styles.headerChip} ${disabled ? styles.headerChipDisabled : ''}`}
        onClick={() => {
          if (!open && !blockedByOther) setOpen(true);
        }}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Desmos Calculator"
        title={
          open
            ? 'Desmos is open'
            : blockedByOther
              ? 'Close the open Desmos first'
              : 'Open Desmos Calculator'
        }
      >
        <Image
          src="/calculator.svg"
          alt=""
          width={16}
          height={16}
          className={styles.headerChipIcon}
          aria-hidden
        />
        <span className={styles.headerChipLabelFull}>Desmos Calculator</span>
        <span className={styles.headerChipLabelMed} aria-hidden="true">
          Desmos Calc…
        </span>
        <span className={styles.headerChipLabelShort} aria-hidden="true">
          Desmos…
        </span>
        <span className={styles.headerChipLabelMini} aria-hidden="true">
          Calc…
        </span>
      </button>
    );
  }, [show, open, blockedByOther, panelId]);

  const renderChildren = () => {
    if (typeof children === 'function') {
      return children({
        calculatorButton,
        isOpen: open,
        showDesmos: show,
        blockedByOther,
      });
    }
    return (
      <>
        {children}
        {calculatorButton}
      </>
    );
  };

  if (!show) {
    if (typeof children === 'function') {
      return children({
        calculatorButton: null,
        isOpen: false,
        showDesmos: false,
        blockedByOther: false,
      });
    }
    return children;
  }

  const panel = everOpened ? (
    <aside
      id={panelId}
      ref={panelRef}
      className={[
        styles.panel,
        isCompact ? styles.panelFullscreen : styles.panelDocked,
        open ? styles.panelVisible : styles.panelHidden,
        !isCompact && (dragPos || panelSize) ? styles.panelDragged : '',
        !isCompact && isDragging ? styles.panelDragging : '',
        !isCompact && isResizing ? styles.panelResizing : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        !isCompact && open
          ? {
              ...(dragPos ? { left: dragPos.left, top: dragPos.top, right: 'auto' } : null),
              ...(panelSize
                ? {
                    width: panelSize.width,
                    height: panelSize.height,
                    maxWidth: 'none',
                  }
                : null),
            }
          : undefined
      }
      aria-label="Desmos calculator"
      role="dialog"
      aria-modal={isCompact && open ? 'true' : undefined}
      aria-hidden={!open}
    >
      <div
        className={`${styles.panelHeader} ${!isCompact ? styles.panelHeaderDraggable : ''}`}
        onPointerDown={onDesktopDragStart}
        onPointerMove={onDesktopDragMove}
        onPointerUp={onDesktopDragEnd}
        onPointerCancel={onDesktopDragEnd}
        title={!isCompact ? 'Drag to move' : undefined}
      >
        <div className={styles.panelTitle}>
          <Image
            src="/calculator.svg"
            alt=""
            width={20}
            height={20}
            className={styles.headerIcon}
            aria-hidden
          />
          <span className={styles.panelTitleTextFull}>Desmos Calculator</span>
          <span className={styles.panelTitleTextShort} aria-hidden="true">
            Desmos…
          </span>
        </div>
        <div className={styles.panelHeaderCenter}>
          <CalculatorTypeSelect
            value={calcType}
            onChange={setCalcType}
            disabled={status === 'loading'}
          />
        </div>
        <button
          type="button"
          className={styles.closeBtn}
          aria-label="Close calculator"
          onClick={() => setOpen(false)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {status === 'loading' ? (
        <div className={styles.loader} role="status" aria-live="polite" aria-busy="true">
          <div className={styles.loaderCard}>
            <div className={styles.spinner} aria-hidden>
              <span className={styles.spinnerRing} />
              <span className={styles.spinnerCore} />
            </div>
            <div className={styles.loaderText}>Loading Desmos</div>
            <div className={styles.loaderSubtext}>Preparing your calculator…</div>
          </div>
        </div>
      ) : null}
      {status === 'error' ? (
        <div className={`${styles.status} ${styles.statusError}`}>
          {errorMsg || 'Desmos failed to load'}
        </div>
      ) : null}

      <div
        ref={hostRef}
        className={styles.calcWrap}
        style={{
          visibility: status === 'ready' ? 'visible' : 'hidden',
          position: status === 'loading' ? 'absolute' : undefined,
          inset: status === 'loading' ? 0 : undefined,
          opacity: status === 'ready' ? 1 : 0,
          pointerEvents: status === 'ready' ? 'auto' : 'none',
        }}
      />

      {!isCompact ? (
        <>
          {[
            ['n', styles.resize_n],
            ['s', styles.resize_s],
            ['e', styles.resize_e],
            ['w', styles.resize_w],
            ['ne', styles.resize_ne],
            ['nw', styles.resize_nw],
            ['se', styles.resize_se],
            ['sw', styles.resize_sw],
          ].map(([edge, edgeClass]) => (
            <div
              key={edge}
              data-desmos-resize={edge}
              className={`${styles.resizeHandle} ${edgeClass}`}
              onPointerDown={onDesktopResizeStart(edge)}
              onPointerMove={onDesktopResizeMove}
              onPointerUp={onDesktopResizeEnd}
              onPointerCancel={onDesktopResizeEnd}
              aria-hidden
            />
          ))}
        </>
      ) : null}
    </aside>
  ) : null;

  if (useExternalLayout) {
    return (
      <>
        {renderChildren()}
        {everOpened && portalReady ? createPortal(panel, document.body) : null}
      </>
    );
  }

  return (
    <div className={`${styles.shell} ${open && !isCompact ? styles.shellOpen : ''}`}>
      <div className={`${styles.layout} ${open && !isCompact ? styles.layoutOpen : ''}`}>
        <div className={styles.questionSlot}>{renderChildren()}</div>
        {open && !isCompact ? <div className={styles.panelSpacer} aria-hidden /> : null}
      </div>
      {everOpened && portalReady ? createPortal(panel, document.body) : null}
    </div>
  );
}
