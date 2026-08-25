import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import styles from '../../styles/DesmosQuestionAssist.module.css';

const DesmosAssistGroupContext = createContext(null);

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

export function useDesmosAssistGroup() {
  return useContext(DesmosAssistGroupContext);
}

/**
 * Shared Desmos host for pages with multiple question chips (details / preview).
 * - Only one calculator can be open at a time
 * - On desktop, reserves space so the whole page content (score + questions) shifts left
 */
export default function DesmosAssistGroup({ children, contentClassName = '' }) {
  const isCompact = useIsCompactLayout(1024);
  const [openKeys, setOpenKeys] = useState({ desmos: null, reference: null });
  const [panelWidth, setPanelWidthState] = useState(null);

  const claimOpen = useCallback((type, key) => {
    const resolvedType = key == null ? 'desmos' : String(type || 'desmos');
    const resolvedKey = key == null ? type : key;
    setOpenKeys((current) => ({
      ...current,
      [resolvedType]: String(resolvedKey),
    }));
  }, []);

  const releaseOpen = useCallback((type, key) => {
    const resolvedType = key == null ? 'desmos' : String(type || 'desmos');
    const resolvedKey = key == null ? type : key;
    setOpenKeys((current) => ({
      ...current,
      [resolvedType]: current[resolvedType] === String(resolvedKey) ? null : current[resolvedType],
    }));
  }, []);

  const setPanelWidth = useCallback((width) => {
    if (width == null || Number.isNaN(Number(width))) {
      setPanelWidthState(null);
      return;
    }
    setPanelWidthState(Math.round(Number(width)));
  }, []);

  const isBlocked = useCallback((type, key) => {
    const resolvedType = key == null ? 'desmos' : String(type || 'desmos');
    const resolvedKey = key == null ? type : key;
    const openKey = openKeys[resolvedType];
    return openKey != null && openKey !== String(resolvedKey);
  }, [openKeys]);

  useEffect(() => {
    if (!openKeys.desmos) setPanelWidthState(null);
  }, [openKeys.desmos]);

  useEffect(() => {
    if (isCompact) {
      setPanelWidthState(null);
    }
  }, [isCompact]);

  const value = useMemo(
    () => ({
      openKey: openKeys.desmos,
      openKeys,
      claimOpen,
      releaseOpen,
      setPanelWidth,
      panelWidth,
      isBlocked,
      isCompact,
      isOpen: Boolean(openKeys.desmos) || Boolean(openKeys.reference),
    }),
    [openKeys, claimOpen, releaseOpen, setPanelWidth, panelWidth, isBlocked, isCompact]
  );

  const isOpenDesktop = Boolean(openKeys.desmos) && !isCompact;

  return (
    <DesmosAssistGroupContext.Provider value={value}>
      <div className={`${styles.shell} ${isOpenDesktop ? styles.shellOpen : ''}`}>
        <div className={`${styles.layout} ${isOpenDesktop ? styles.layoutOpen : ''}`}>
          <div className={`${styles.questionSlot} ${contentClassName}`.trim()}>
            {typeof children === 'function'
              ? children({ isOpen: Boolean(openKeys.desmos) || Boolean(openKeys.reference), isCompact, isOpenDesktop })
              : children}
          </div>
          {isOpenDesktop ? (
            <div
              className={styles.panelSpacer}
              style={
                panelWidth
                  ? {
                      width: panelWidth,
                      maxWidth: 'none',
                      minWidth: panelWidth,
                    }
                  : undefined
              }
              aria-hidden
            />
          ) : null}
        </div>
      </div>
    </DesmosAssistGroupContext.Provider>
  );
}
