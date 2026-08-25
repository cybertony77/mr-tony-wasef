import { useState } from 'react';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import Title from '../../components/Title';
import apiClient from '../../lib/axios';
import styles from '../../styles/StudentCertificates.module.css';

async function fetchCertificateBlob(certId) {
  const response = await apiClient.get(`/api/certificates/download?id=${certId}`, {
    responseType: 'blob',
  });
  const contentType = response.headers['content-type'] || '';
  if (contentType.includes('application/json')) {
    const text = await response.data.text();
    const parsed = JSON.parse(text);
    throw new Error(parsed.error || 'Failed to load certificate');
  }
  const raw = response.data;
  const bytes = raw instanceof Blob ? await raw.arrayBuffer() : raw;
  return new Blob([bytes], { type: 'image/png' });
}

/** Build a real image/png File so the OS share sheet shows an image thumbnail (copyable). */
async function toPngFile(blob, fileName) {
  const bytes = await blob.arrayBuffer();
  return new File([bytes], fileName, {
    type: 'image/png',
    lastModified: Date.now(),
  });
}

export default function MyCertificatesPage() {
  const [openId, setOpenId] = useState(null);
  const [playerState, setPlayerState] = useState({});
  const [downloadingId, setDownloadingId] = useState(null);
  const [sharingId, setSharingId] = useState(null);
  const [toast, setToast] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['student-certificates'],
    queryFn: async () => (await apiClient.get('/api/certificates/student')).data,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const certificates = data?.certificates || [];

  const clearPreviewUrl = (id) => {
    setPlayerState((prev) => {
      const cur = prev[id];
      if (cur?.url) URL.revokeObjectURL(cur.url);
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const loadCertificate = async (cert) => {
    const id = String(cert._id);
    try {
      const blob = await fetchCertificateBlob(cert._id);
      const url = URL.createObjectURL(blob);
      setPlayerState((prev) => {
        // Ignore stale responses if this card was closed or switched
        if (prev[id]?.status !== 'loading') return prev;
        if (prev[id]?.url) URL.revokeObjectURL(prev[id].url);
        return { ...prev, [id]: { status: 'ready', url } };
      });
    } catch (err) {
      let msg = err.message || 'Could not load certificate';
      if (err.response?.data instanceof Blob) {
        try {
          msg = JSON.parse(await err.response.data.text()).error || msg;
        } catch {
          /* keep */
        }
      }
      setPlayerState((prev) => {
        if (prev[id]?.status !== 'loading') return prev;
        return { ...prev, [id]: { status: 'error', message: msg } };
      });
    }
  };

  const handleToggle = (cert) => {
    const id = String(cert._id);

    if (openId === id) {
      setOpenId(null);
      clearPreviewUrl(id);
      return;
    }

    const previousId = openId;
    // Set open + loading in one sync turn so the shell never paints empty
    setOpenId(id);
    setPlayerState((prev) => {
      const next = { ...prev };
      if (previousId && previousId !== id) {
        if (next[previousId]?.url) URL.revokeObjectURL(next[previousId].url);
        delete next[previousId];
      }
      if (next[id]?.url) URL.revokeObjectURL(next[id].url);
      next[id] = { status: 'loading' };
      return next;
    });
    loadCertificate(cert);
  };

  const getCertificateBlob = async (cert) => {
    const id = String(cert._id);
    const existing = playerState[id];
    let blob;
    if (existing?.status === 'ready' && existing.url) {
      const res = await fetch(existing.url);
      blob = await res.blob();
    } else {
      blob = await fetchCertificateBlob(cert._id);
    }
    if (blob.type === 'image/png') return blob;
    const bytes = await blob.arrayBuffer();
    return new Blob([bytes], { type: 'image/png' });
  };

  const fileNameFor = (cert) => {
    const raw = String(cert.certificate_name || 'Certificate').trim();
    const name =
      raw
        .replace(/[^\w.\- ]+/g, '')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '') || 'Certificate';
    const alreadyHasCertificate = /certificate/i.test(name);
    return alreadyHasCertificate ? `${name}.png` : `Certificate_${name}.png`;
  };

  const handleDownload = async (cert) => {
    const id = String(cert._id);
    setDownloadingId(id);
    setToast('');
    try {
      const file = await toPngFile(await getCertificateBlob(cert), fileNameFor(cert));
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setToast('✅ Certificate downloaded');
      setTimeout(() => setToast(''), 4000);
    } catch (err) {
      let msg = 'Download failed';
      if (err.response?.data instanceof Blob) {
        try {
          msg = JSON.parse(await err.response.data.text()).error || msg;
        } catch {
          msg = err.message || msg;
        }
      } else {
        msg = err.message || msg;
      }
      setToast(`❌ ${msg}`);
      setTimeout(() => setToast(''), 6000);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleShare = async (cert) => {
    const id = String(cert._id);
    setSharingId(id);
    setToast('');
    try {
      if (typeof navigator === 'undefined' || !navigator.share) {
        setToast('❌ Sharing is not supported on this device');
        setTimeout(() => setToast(''), 5000);
        return;
      }

      const file = await toPngFile(await getCertificateBlob(cert), fileNameFor(cert));

      console.log(file);
      console.log(file.type);
      console.log(file.name);

      if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
        setToast('❌ Sharing images is not supported on this device');
        setTimeout(() => setToast(''), 5000);
        return;
      }

      await navigator.share({
        files: [file],
        title: 'Certificate',
      });
    } catch (err) {
      if (err?.name === 'AbortError') {
        /* user cancelled share sheet */
      } else {
        let msg = err.message || 'Share failed';
        if (err.response?.data instanceof Blob) {
          try {
            msg = JSON.parse(await err.response.data.text()).error || msg;
          } catch {
            /* keep */
          }
        }
        setToast(`❌ ${msg}`);
        setTimeout(() => setToast(''), 6000);
      }
    } finally {
      setSharingId(null);
    }
  };

  return (
    <div style={{ minHeight: '100vh', padding: '20px 5px' }}>
      <div style={{ maxWidth: 760, margin: '40px auto', padding: '20px 5px', width: '100%', boxSizing: 'border-box' }}>
        <Title backText="Back" href="/student_dashboard">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Image src="/certificate.svg" alt="My Certificates" width={30} height={30} />
            My Certificates
          </div>
        </Title>

        <div className={styles.panel}>
          {isLoading ? (
            <div className={styles.emptyBox}>
              <div className={styles.pageLoader}>
                <div className={styles.spinner} />
                <div className={styles.loaderRing} />
              </div>
              <p className={styles.emptyTitle}>Loading certificates…</p>
              <p className={styles.emptyText}>Preparing your awards</p>
            </div>
          ) : error ? (
            <div className={styles.emptyBox} role="alert">
              <p className={styles.emptyTitle}>Could not load certificates</p>
            </div>
          ) : certificates.length === 0 ? (
            <div className={styles.emptyBox}>
              <div className={styles.emptyIcon}>
                <Image src="/certificate.svg" alt="" width={36} height={36} />
              </div>
              <p className={styles.emptyTitle}>No certificates available</p>
              <p className={styles.emptyText}>You don’t have any certificates yet.</p>
            </div>
          ) : (
            <div className={styles.list}>
              {certificates.map((cert) => {
                const id = String(cert._id);
                const isOpen = openId === id;
                const state = playerState[id];
                const isReady = isOpen && state?.status === 'ready' && !!state.url;
                const isError = isOpen && state?.status === 'error';
                // Treat missing/pending as loading so the shell never flashes empty
                const isLoadingCert = isOpen && !isReady && !isError;

                return (
                  <article
                    key={id}
                    className={`${styles.card} ${styles.cardClickable} ${isOpen ? styles.cardOpen : ''}`}
                    onClick={() => handleToggle(cert)}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isOpen}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleToggle(cert);
                      }
                    }}
                  >
                    <div className={styles.cardHeaderRow}>
                      <div className={styles.cardTop}>
                        <div className={styles.cardBadge}>
                          <Image src="/certificate.svg" alt="" width={24} height={24} />
                        </div>
                        <div className={styles.cardMeta}>
                          <h3 className={styles.cardTitle}>{cert.certificate_name}</h3>
                          {cert.create_date && <p className={styles.cardHint}>{cert.create_date}</p>}
                        </div>
                      </div>
                      <div className={styles.cardChevron} aria-hidden>
                        <Image
                          src={isOpen ? '/chevron-down.svg' : '/chevron-right.svg'}
                          alt=""
                          width={20}
                          height={20}
                        />
                      </div>
                    </div>

                    {isOpen && (
                      <div
                        className={styles.viewerShell}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <div className={styles.viewerWrap}>
                          {isLoadingCert && (
                            <div className={styles.spinnerOverlay} aria-live="polite">
                              <div className={styles.spinner} />
                              <p className={styles.spinnerText}>Generating certificate…</p>
                              <p className={styles.spinnerSub}>This may take a moment</p>
                            </div>
                          )}

                          {isError && (
                            <div className={styles.errorBox} role="alert">
                              <Image src="/alert-triangle2.svg" alt="" width={28} height={28} />
                              <p className={styles.errorTitle}>Certificate unavailable</p>
                              <p className={styles.errorText}>{state.message}</p>
                              <button
                                type="button"
                                className={styles.retryBtn}
                                onClick={() => {
                                  setPlayerState((prev) => ({ ...prev, [id]: { status: 'loading' } }));
                                  loadCertificate(cert);
                                }}
                              >
                                Try again
                              </button>
                            </div>
                          )}

                          {isReady && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              className={styles.certImage}
                              src={state.url}
                              alt={cert.certificate_name}
                            />
                          )}
                        </div>

                        {(isReady || isError) && (
                          <div className={styles.actionRow}>
                            <button
                              type="button"
                              className={styles.downloadBtn}
                              onClick={() => handleDownload(cert)}
                              disabled={downloadingId === id || sharingId === id || !isReady}
                            >
                              <Image src="/download.svg" alt="" width={20} height={20} className={styles.downloadIcon} />
                              {downloadingId === id ? 'Downloading…' : 'Download'}
                            </button>
                            <button
                              type="button"
                              className={styles.shareBtn}
                              onClick={() => handleShare(cert)}
                              disabled={sharingId === id || downloadingId === id || !isReady}
                            >
                              <Image src="/share.svg" alt="" width={20} height={20} className={styles.shareIcon} />
                              {sharingId === id ? 'Sharing…' : 'Share'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {toast && (
            <div className={`${styles.toast} ${toast.startsWith('❌') ? styles.toastError : styles.toastSuccess}`}>
              {toast}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
