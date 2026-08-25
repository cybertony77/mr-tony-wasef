import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import styles from '../styles/AppVideosModal.module.css';

function detectLinkKind(url) {
  const lower = String(url || '').toLowerCase();
  if (lower.includes('youtube') || lower.includes('youtu.be')) return 'youtube';
  if (lower.includes('drive') || lower.includes('docs.google')) return 'drive';
  return 'link';
}

function linkIconSrc(kind) {
  if (kind === 'youtube') return '/youtube.svg';
  if (kind === 'drive') return '/drive.svg';
  return '/link.svg';
}

function extractDriveFileId(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function extractYoutubeId(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  const patterns = [
    /(?:youtube\.com\/watch\?[^#]*v=|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{6,})/i,
    /[?&]v=([a-zA-Z0-9_-]{6,})/i,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function toPreviewSrc(url) {
  const kind = detectLinkKind(url);
  if (kind === 'youtube') {
    const id = extractYoutubeId(url);
    // Normal YouTube embed with native controls (not the secure /api/youtube shell).
    if (id) {
      return `https://www.youtube.com/embed/${id}?rel=0&playsinline=1&modestbranding=1&controls=1&fs=1`;
    }
    return null;
  }
  if (kind === 'drive') {
    const fileId = extractDriveFileId(url);
    if (fileId) return `https://drive.google.com/file/d/${fileId}/preview`;
    return null;
  }
  // Generic https link — try embed as-is
  if (/^https?:\/\//i.test(String(url || '').trim())) return String(url).trim();
  return null;
}

function isUsableLink(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/^https?:\/\/(STUDENT_|ASSISTANT_|ADMIN_)/i.test(trimmed)) return false;
  return /^https?:\/\//i.test(trimmed);
}

function kindLabel(kind) {
  if (kind === 'youtube') return 'YouTube';
  if (kind === 'drive') return 'Google Drive';
  return 'Link';
}

function canViewVideo(userRole, videoRole) {
  if (userRole === 'admin' || userRole === 'developer') return true;
  if (userRole === 'assistant') {
    return videoRole === 'student' || videoRole === 'assistant';
  }
  return userRole === 'student' && videoRole === 'student';
}

export default function AppVideosModal({ isOpen, onClose, role = '' }) {
  const modalRef = useRef(null);
  const loadTimersRef = useRef({});
  const [catalog, setCatalog] = useState([]);
  const [catalogStatus, setCatalogStatus] = useState('idle');
  const [catalogError, setCatalogError] = useState('');
  const [catalogReloadKey, setCatalogReloadKey] = useState(0);
  const [copiedId, setCopiedId] = useState(null);
  const [copyErrorId, setCopyErrorId] = useState(null);
  const [sharingId, setSharingId] = useState(null);
  const [shareErrorId, setShareErrorId] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [playerState, setPlayerState] = useState({}); // id -> { status: loading|ready|error, message? }

  const normalizedRole = String(role || '').toLowerCase();

  useEffect(() => {
    if (!isOpen) return undefined;

    let cancelled = false;
    const loadVideos = async () => {
      setCatalogStatus('loading');
      setCatalogError('');

      try {
        const response = await fetch(`/api/app-videos?_=${Date.now()}`, {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || 'Could not load app videos');
        }

        if (!cancelled) {
          setCatalog(Array.isArray(data?.videos) ? data.videos : []);
          setCatalogStatus('ready');
        }
      } catch (error) {
        if (!cancelled) {
          setCatalog([]);
          setCatalogError(error?.message || 'Could not load app videos');
          setCatalogStatus('error');
        }
      }
    };

    loadVideos();
    return () => {
      cancelled = true;
    };
  }, [isOpen, catalogReloadKey]);

  const items = useMemo(() => {
    return catalog
      .filter((video) => canViewVideo(normalizedRole, video.video_role))
      .map((video) => {
        const url = String(video.video_url || '').trim();
        const kind = detectLinkKind(url);
        return {
          id: video.id,
          label: video.video_title,
          section: video.video_role.charAt(0).toUpperCase() + video.video_role.slice(1),
          url,
          kind,
          previewSrc: toPreviewSrc(url),
        };
      })
      .filter((item) => isUsableLink(item.url));
  }, [catalog, normalizedRole]);

  const sections = useMemo(() => {
    const order = ['Admin', 'Assistant', 'Student'];
    const grouped = {};
    items.forEach((item) => {
      if (!grouped[item.section]) grouped[item.section] = [];
      grouped[item.section].push(item);
    });
    const knownSections = order
      .filter((name) => grouped[name]?.length)
      .map((name) => ({ name, items: grouped[name] }));
    const otherSections = Object.keys(grouped)
      .filter((name) => !order.includes(name))
      .map((name) => ({ name, items: grouped[name] }));

    return [...knownSections, ...otherSections];
  }, [items]);

  useEffect(() => {
    if (!isOpen) {
      setOpenId(null);
      setCopiedId(null);
      setCopyErrorId(null);
      setSharingId(null);
      setShareErrorId(null);
      setPlayerState({});
      Object.values(loadTimersRef.current).forEach((t) => clearTimeout(t));
      loadTimersRef.current = {};
      return undefined;
    }

    const onPointerDown = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) onClose();
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  const clearLoadTimer = (id) => {
    if (loadTimersRef.current[id]) {
      clearTimeout(loadTimersRef.current[id]);
      delete loadTimersRef.current[id];
    }
  };

  const startPlayer = (item) => {
    clearLoadTimer(item.id);

    if (!item.previewSrc) {
      setPlayerState((prev) => ({
        ...prev,
        [item.id]: {
          status: 'error',
          message: 'This video link is invalid or not supported. Please check the URL.',
        },
      }));
      return;
    }

    setPlayerState((prev) => ({
      ...prev,
      [item.id]: { status: 'loading' },
    }));

    // Cross-origin iframes may not always report errors — timeout as fallback
    loadTimersRef.current[item.id] = setTimeout(() => {
      setPlayerState((prev) => {
        if (prev[item.id]?.status !== 'loading') return prev;
        return {
          ...prev,
          [item.id]: {
            status: 'error',
            message: 'The video is taking too long or failed to load. Try Copy and open it in a new tab.',
          },
        };
      });
    }, 15000);
  };

  const handleCopy = async (item) => {
    try {
      await navigator.clipboard.writeText(item.url);
      setCopyErrorId(null);
      setShareErrorId(null);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId((prev) => (prev === item.id ? null : prev)), 2200);
    } catch (err) {
      console.error('Copy failed:', err);
      setCopiedId(null);
      setCopyErrorId(item.id);
      setTimeout(() => setCopyErrorId((prev) => (prev === item.id ? null : prev)), 2800);
    }
  };

  const handleShare = async (item) => {
    setShareErrorId(null);
    setSharingId(item.id);
    try {
      if (typeof navigator === 'undefined' || !navigator.share) {
        setShareErrorId(item.id);
        setTimeout(() => setShareErrorId((prev) => (prev === item.id ? null : prev)), 2800);
        return;
      }
      const shareData = {
        title: item.label || 'App Video',
        text: item.label || 'App Video',
        url: item.url,
      };
      if (typeof navigator.canShare === 'function' && !navigator.canShare(shareData)) {
        await navigator.share({ title: shareData.title, text: item.url });
      } else {
        await navigator.share(shareData);
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('Share failed:', err);
        setShareErrorId(item.id);
        setTimeout(() => setShareErrorId((prev) => (prev === item.id ? null : prev)), 2800);
      }
    } finally {
      setSharingId(null);
    }
  };

  const handleOpen = (item) => {
    setOpenId((prev) => {
      if (prev === item.id) {
        clearLoadTimer(item.id);
        return null;
      }
      startPlayer(item);
      return item.id;
    });
  };

  const handleIframeLoad = (id) => {
    clearLoadTimer(id);
    setPlayerState((prev) => {
      if (prev[id]?.status === 'error') return prev;
      return { ...prev, [id]: { status: 'ready' } };
    });
  };

  const handleIframeError = (id) => {
    clearLoadTimer(id);
    setPlayerState((prev) => ({
      ...prev,
      [id]: {
        status: 'error',
        message: 'Could not play this video. The link may be private, blocked, or broken.',
      },
    }));
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} role="presentation">
      <div
        className={styles.panel}
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-videos-title"
      >
        <div className={styles.header}>
          <div className={styles.headerIcon}>
            <Image src="/video.svg" alt="" width={26} height={26} />
          </div>
          <div className={styles.headerText}>
            <h2 id="app-videos-title" className={styles.title}>
              App Videos
            </h2>
            <p className={styles.subtitle}>
              App explanation videos for you · Copy, share, or watch.
            </p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <Image src="/close-cross.svg" alt="" width={28} height={28} />
          </button>
        </div>

        <div className={styles.body}>
          {catalogStatus === 'loading' ? (
            <div className={styles.emptyBox} aria-live="polite">
              <div className={styles.catalogSpinner} />
              <p className={styles.emptyTitle}>Loading app videos…</p>
              <p className={styles.emptyText}>Please wait we are loading the videos...</p>
            </div>
          ) : catalogStatus === 'error' ? (
            <div className={styles.emptyBox} role="alert">
              <Image src="/alert-triangle2.svg" alt="" width={36} height={36} />
              <p className={styles.emptyTitle}>Could not load videos</p>
              <p className={styles.emptyText}>{catalogError}</p>
              <button
                type="button"
                className={styles.retryBtn}
                onClick={() => setCatalogReloadKey((key) => key + 1)}
              >
                Try again
              </button>
            </div>
          ) : sections.length === 0 ? (
            <div className={styles.emptyBox}>
              <Image src="/video.svg" alt="" width={36} height={36} />
              <p className={styles.emptyTitle}>No videos available</p>
              <p className={styles.emptyText}>There are no videos for you right now.</p>
            </div>
          ) : (
            sections.map((section) => (
              <section key={section.name} className={styles.section}>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionDot} />
                  <h3 className={styles.sectionTitle}>{section.name}</h3>
                  <span className={styles.sectionLine} />
                  <span className={styles.sectionCount}>{section.items.length}</span>
                </div>

                <div className={styles.sectionList}>
                  {section.items.map((item) => {
                    const isOpenPlayer = openId === item.id;
                    const isCopied = copiedId === item.id;
                    const isCopyError = copyErrorId === item.id;
                    const isSharing = sharingId === item.id;
                    const isShareError = shareErrorId === item.id;
                    const state = playerState[item.id];
                    const isLoading = isOpenPlayer && state?.status === 'loading';
                    const isReady = isOpenPlayer && state?.status === 'ready';
                    const isError = isOpenPlayer && state?.status === 'error';

                    return (
                      <article key={item.id} className={styles.card}>
                        <div className={styles.cardTop}>
                          <div
                            className={`${styles.cardBadge} ${
                              item.kind === 'youtube'
                                ? styles.badgeYoutube
                                : item.kind === 'drive'
                                  ? styles.badgeDrive
                                  : styles.badgeLink
                            }`}
                          >
                            <Image src={linkIconSrc(item.kind)} alt="" width={22} height={22} />
                          </div>
                          <div className={styles.cardMeta}>
                            <div className={styles.cardTitleRow}>
                              <h4 className={styles.cardLabel}>{item.label}</h4>
                              <span className={styles.sourceTag}>{kindLabel(item.kind)}</span>
                            </div>
                            <p className={styles.cardLink}>{item.url}</p>
                          </div>
                        </div>

                        <div className={styles.actions}>
                          <button
                            type="button"
                            className={`${styles.btn} ${styles.btnCopy} ${isCopied ? styles.btnCopyDone : ''} ${isCopyError ? styles.btnCopyError : ''}`}
                            onClick={() => handleCopy(item)}
                          >
                            <Image
                              src={isCopied ? '/success-mark3.svg' : '/copy3.svg'}
                              alt=""
                              width={18}
                              height={18}
                            />
                            {isCopied ? 'Link Copied' : 'Copy Link'}
                          </button>
                          <button
                            type="button"
                            className={`${styles.btn} ${styles.btnOpen} ${isOpenPlayer ? styles.btnOpenActive : ''}`}
                            onClick={() => handleOpen(item)}
                          >
                            <Image src={isOpenPlayer ? '/video-stop.svg' : '/play.svg'} alt="" width={18} height={18} />
                            {isOpenPlayer ? 'Close Video' : 'Open Video'}
                          </button>
                          <button
                            type="button"
                            className={`${styles.btn} ${styles.btnShare} ${isShareError ? styles.btnShareError : ''}`}
                            onClick={() => handleShare(item)}
                            disabled={isSharing}
                          >
                            <Image src="/share.svg" alt="" width={18} height={18} />
                            {isSharing ? 'Sharing…' : 'Share Link'}
                          </button>
                        </div>

                        {isOpenPlayer && (
                          <div className={styles.playerShell}>
                            <div className={styles.playerWrap}>
                              {isLoading && (
                                <div className={styles.spinnerOverlay} aria-live="polite">
                                  <div className={styles.spinner} aria-hidden="true" />
                                  <p className={styles.spinnerText}>Loading video…</p>
                                </div>
                              )}

                              {isError && (
                                <div className={styles.errorBox} role="alert">
                                  <Image src="/alert-triangle2.svg" alt="" width={28} height={28} />
                                  <p className={styles.errorTitle}>Video unavailable</p>
                                  <p className={styles.errorText}>{state.message}</p>
                                  <button
                                    type="button"
                                    className={styles.retryBtn}
                                    onClick={() => startPlayer(item)}
                                  >
                                    Try again
                                  </button>
                                </div>
                              )}

                              {item.previewSrc && !isError && (
                                <iframe
                                  className={`${styles.player} ${isReady ? styles.playerVisible : styles.playerHidden}`}
                                  src={item.previewSrc}
                                  title={item.label}
                                  width="100%"
                                  height="100%"
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                                  allowFullScreen
                                  loading="eager"
                                  referrerPolicy="strict-origin-when-cross-origin"
                                  onLoad={() => handleIframeLoad(item.id)}
                                  onError={() => handleIframeError(item.id)}
                                />
                              )}
                            </div>
                          </div>
                        )}

                        {(isCopied || isCopyError || isShareError) && (
                          <div
                            className={`${styles.toast} ${isCopied ? styles.toastSuccess : styles.toastError}`}
                            role="status"
                          >
                            <Image
                              src={isCopied ? '/success-mark3.svg' : '/alert-triangle2.svg'}
                              alt=""
                              width={20}
                              height={20}
                            />
                            <span>
                              {isCopied
                                ? 'Link copied successfully'
                                : isShareError
                                  ? 'Sharing is not supported on this device'
                                  : 'Could not copy the link. Try again.'}
                            </span>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
