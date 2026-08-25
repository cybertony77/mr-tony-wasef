import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { createPortal } from 'react-dom';
import { useSystemConfig } from '../../lib/api/system';
import chipStyles from '../../styles/DesmosQuestionAssist.module.css';
import { useDesmosAssistGroup } from './DesmosAssistGroup';
import styles from '../../styles/MathReferenceSheetAssist.module.css';

function isFeatureEnabled(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

const REFERENCE_IMAGES = ['/SAT-Math-Refrence.png'];

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const WHEEL_ZOOM_STEP = 0.2;

function ReferenceModal({ currentImage, onClose, open }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);

  // refs for gesture tracking
  const lastPan = useRef({ x: 0, y: 0 });
  const lastDist = useRef(null); // pinch distance
  const lastZoom = useRef(1); // zoom at pinch start
  const pointers = useRef({}); // active pointer ids
  const lastTap = useRef(0);

  useEffect(() => {
    if (open) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setImageLoaded(false);
      lastTap.current = 0;
      lastDist.current = null;
      lastZoom.current = 1;
      pointers.current = {};
    }
  }, [open, currentImage]);

  // lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // reset pan when zoom goes back to 1
  useEffect(() => {
    if (zoom <= 1) setPan({ x: 0, y: 0 });
  }, [zoom]);

  // ── pointer helpers ──────────────────────────────────────────────
  const getPointerPair = () => {
    const pts = Object.values(pointers.current);
    if (pts.length < 2) return null;
    return [pts[0], pts[1]];
  };

  const dist = (a, b) =>
    Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current[e.pointerId] = e;

    const pair = getPointerPair();
    if (pair) {
      // pinch start
      lastDist.current = dist(pair[0], pair[1]);
      lastZoom.current = zoom;
    } else {
      // single-finger pan start
      lastPan.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const onPointerMove = (e) => {
    pointers.current[e.pointerId] = e;
    const pair = getPointerPair();

    if (pair) {
      // ── pinch-to-zoom ──
      const d = dist(pair[0], pair[1]);
      if (lastDist.current == null) {
        lastDist.current = d;
        lastZoom.current = zoom;
        return;
      }
      const ratio = d / lastDist.current;
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, lastZoom.current * ratio));
      setZoom(next);
    } else if (zoom > 1) {
      // ── single-finger pan (only when zoomed) ──
      setPan({ x: e.clientX - lastPan.current.x, y: e.clientY - lastPan.current.y });
    }
  };

  const onPointerUp = (e) => {
    delete pointers.current[e.pointerId];
    lastDist.current = null;
    // update pan anchor for remaining finger if any
    const remaining = Object.values(pointers.current);
    if (remaining.length === 1) {
      lastPan.current = { x: remaining[0].clientX - pan.x, y: remaining[0].clientY - pan.y };
    }
  };

  const onWheel = (e) => {
    e.preventDefault();
    const direction = e.deltaY < 0 ? 1 : -1;
    setZoom((current) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current + direction * WHEEL_ZOOM_STEP));
      if (next <= 1) {
        setPan({ x: 0, y: 0 });
      }
      return next;
    });
  };

  const onDoubleClick = (e) => {
    e.preventDefault();
    if (zoom > 1) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    setZoom(2);
  };

  // double-tap to reset
  const onViewportClick = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
    lastTap.current = now;
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Math Reference Sheet"
      >
        <div className={styles.header}>
          <div className={styles.title}>Math Reference Sheet</div>
          <button
            type="button"
            className={`${chipStyles.closeBtn} ${styles.closeBtn}`}
            onClick={onClose}
            aria-label="Close reference sheet"
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

        <div
          className={styles.viewport}
          style={{
            touchAction: 'none',
            cursor: zoom > 1 ? 'grab' : 'zoom-in',
            userSelect: 'none',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
          onDoubleClick={onDoubleClick}
          onClick={onViewportClick}
        >
          {!imageLoaded ? (
            <div className={styles.loader} role="status" aria-live="polite" aria-busy="true">
              <div className={styles.loaderCard}>
                <div className={styles.spinner} aria-hidden>
                  <span className={styles.spinnerRing} />
                  <span className={styles.spinnerCore} />
                </div>
                <div className={styles.loaderText}>Loading Reference Sheet</div>
                <div className={styles.loaderSubtext}>Preparing the image...</div>
              </div>
            </div>
          ) : null}
          <Image
            src={currentImage}
            alt="Math Reference Sheet"
            width={1200}
            height={1700}
            className={styles.image}
            priority
            draggable={false}
            onLoad={() => setImageLoaded(true)}
            style={{
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              transformOrigin: 'center center',
              transition: 'none',
              userSelect: 'none',
              pointerEvents: 'none',
              opacity: imageLoaded ? 1 : 0,
            }}
          />
        </div>

      </div>
    </div>
  );
}

export default function MathReferenceSheetAssist({ children, instanceKey = 'reference', iconDark = false }) {
  const { data: systemConfig } = useSystemConfig();
  const show = isFeatureEnabled(systemConfig?.math_reference_sheet);
  const group = useDesmosAssistGroup();
  const [open, setOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const blockedByOther = Boolean(group?.isBlocked?.('reference', instanceKey));
  const claimOpen = group?.claimOpen;
  const releaseOpen = group?.releaseOpen;

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!claimOpen || !releaseOpen) return undefined;
    if (open) {
      claimOpen('reference', instanceKey);
      return () => releaseOpen('reference', instanceKey);
    }
    releaseOpen('reference', instanceKey);
    return undefined;
  }, [claimOpen, releaseOpen, open, instanceKey]);

  useEffect(() => {
    if (blockedByOther && open) {
      setOpen(false);
    }
  }, [blockedByOther, open]);

  const currentImage = REFERENCE_IMAGES[0];

  const referenceButton = useMemo(() => {
    if (!show) return null;
    const disabled = open || blockedByOther;
    return (
      <button
        type="button"
        className={`${chipStyles.headerChip} ${disabled ? chipStyles.headerChipDisabled : ''}`}
        onClick={() => {
          if (!open && !blockedByOther) setOpen(true);
        }}
        disabled={disabled}
        aria-expanded={open}
        aria-label="Open math reference sheet"
        title={
          open
            ? 'Reference sheet is open'
            : blockedByOther
              ? 'Close the open popup first'
              : 'Open math reference sheet'
        }
      >
        <Image
          src="/notes3.svg"
          alt=""
          width={16}
          height={16}
          className={`${chipStyles.headerChipIcon} ${iconDark ? chipStyles.headerChipIconDark : ''}`}
          aria-hidden
        />
        <span className={chipStyles.headerChipLabelFull}>Reference Sheet</span>
        <span className={chipStyles.headerChipLabelMed} aria-hidden="true">Ref Sheet</span>
        <span className={chipStyles.headerChipLabelShort} aria-hidden="true">Ref…</span>
        <span className={chipStyles.headerChipLabelMini} aria-hidden="true">Ref</span>
      </button>
    );
  }, [show, open, blockedByOther, iconDark]);

  const modal = open ? (
    <ReferenceModal currentImage={currentImage} onClose={() => setOpen(false)} open={open} />
  ) : null;

  if (typeof children === 'function') {
    return (
      <>
        {children({ referenceButton })}
        {portalReady ? createPortal(modal, document.body) : null}
      </>
    );
  }

  return (
    <>
      {children}
      {referenceButton}
      {portalReady ? createPortal(modal, document.body) : null}
    </>
  );
}
