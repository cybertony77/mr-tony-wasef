import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../lib/axios';
import styles from '../styles/GoogleMeetRecordingSelect.module.css';

const PAGE_SIZE = 50;

async function fetchStatus() {
  const response = await apiClient.get('/api/google/status');
  return response.data;
}

async function fetchRecordings(token) {
  const path = token?.trim()
    ? `/api/google/recordings?next_page_token=${encodeURIComponent(token.trim())}`
    : '/api/google/recordings';
  const response = await apiClient.get(path);
  return response.data;
}

export default function GoogleMeetRecordingSelect({ selectedValue, onSelect }) {
  const queryClient = useQueryClient();
  const [tokenHistory, setTokenHistory] = useState(['']);
  const [isOpen, setIsOpen] = useState(false);
  const [connectBusy, setConnectBusy] = useState(false);
  const [disconnectBusy, setDisconnectBusy] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const currentToken = tokenHistory[tokenHistory.length - 1];

  const {
    data: status,
    isLoading: statusLoading,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: ['google-meet-status'],
    queryFn: fetchStatus,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });

  const connected = Boolean(status?.connected);
  const configured = status?.configured !== false;

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['google-meet-recordings', currentToken],
    queryFn: () => fetchRecordings(currentToken),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
    enabled: isOpen && connected,
    retry: 1,
  });

  const recordings = useMemo(() => data?.recordings || [], [data]);
  const nextPageToken = String(data?.next_page_token || '');
  const hasPrev = tokenHistory.length > 1;
  const hasNext = Boolean(nextPageToken);
  const showPagination = hasPrev || hasNext;

  const selectedRecording = recordings.find((item) => selectedValue === item.id);
  const triggerLabel = selectedRecording
    ? `${selectedRecording.title || selectedRecording.name} — ${selectedRecording.created_at_formated || '-'}`
    : selectedValue
      ? 'Google Meet recording selected'
      : 'Select Google Meet recording';

  useEffect(() => {
    if (!disconnectOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setDisconnectOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [disconnectOpen]);

  const handleConnect = async () => {
    setConnectBusy(true);
    try {
      const { data: authData } = await apiClient.get('/api/google/auth');
      const url = authData?.url;
      if (!url) throw new Error('Missing Google auth URL');

      const popup = window.open(url, 'google-meet-oauth', 'width=520,height=720');
      const onMessage = async (event) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type !== 'google-meet-oauth') return;
        window.removeEventListener('message', onMessage);
        await refetchStatus();
        queryClient.invalidateQueries({ queryKey: ['google-meet-recordings'] });
        setConnectBusy(false);
        try {
          popup?.close();
        } catch {
          // ignore
        }
      };
      window.addEventListener('message', onMessage);
      const timer = setInterval(async () => {
        if (popup && !popup.closed) return;
        clearInterval(timer);
        window.removeEventListener('message', onMessage);
        await refetchStatus();
        setConnectBusy(false);
      }, 900);
    } catch (err) {
      setConnectBusy(false);
      alert(err?.response?.data?.error || err?.message || 'Could not start Google connection');
    }
  };

  const confirmDisconnect = async () => {
    setDisconnectBusy(true);
    try {
      await apiClient.post('/api/google/disconnect');
      await refetchStatus();
      queryClient.invalidateQueries({ queryKey: ['google-meet-recordings'] });
      setTokenHistory(['']);
      onSelect('');
      setDisconnectOpen(false);
    } catch (err) {
      alert(err?.response?.data?.error || err?.message || 'Could not disconnect Google');
    } finally {
      setDisconnectBusy(false);
    }
  };

  if (statusLoading) {
    return (
      <div className={styles.wrap}>
        <div className={styles.listState}>
          <span className={styles.spinner} aria-hidden />
          Checking Google connection...
        </div>
      </div>
    );
  }

  if (!configured) {
    return (
      <div className={styles.wrap}>
        <div className={`${styles.listState} ${styles.listError}`}>
          Google Meet OAuth is not configured on the server.
        </div>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className={styles.wrap}>
        <div className={styles.statusCard}>
          <div className={styles.statusLeft}>
            <div className={styles.statusIcon}>
              <img src="/google.svg" alt="" className={styles.statusIconImg} />
            </div>
            <div>
              <div className={styles.statusTitle}>Google account not connected</div>
              <div className={styles.statusHint}>
                Connect once to browse private Meet recordings from Drive.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleConnect}
            disabled={connectBusy}
            className={`${styles.btn} ${styles.btnGoogle}`}
          >
            <img src="/google.svg" alt="" className={styles.btnIcon} />
            {connectBusy ? 'Connecting…' : 'Connect Google'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.statusCard}>
        <div className={styles.statusLeft}>
          <div className={styles.statusIcon}>
            <img src="/google.svg" alt="" className={styles.statusIconImg} />
          </div>
          <div>
            <div className={styles.statusTitle}>
              Connected
              {status?.email ? (
                <>
                  {' · '}
                  <span className={styles.statusEmailInline}>{status.email}</span>
                </>
              ) : null}
            </div>
            <div className={styles.statusHint}>Google Meet recordings are ready to select.</div>
          </div>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            onClick={() => setDisconnectOpen(true)}
            disabled={disconnectBusy}
            className={`${styles.btn} ${styles.btnDanger}`}
          >
            <img src="/unlink.svg" alt="" className={styles.btnIcon} />
            Disconnect
          </button>
        </div>
      </div>

      <div className={styles.selectLabel}>Google Meet Recordings</div>
      <div
        onClick={() => setIsOpen((prev) => !prev)}
        className={`${styles.trigger} ${isOpen ? styles.triggerOpen : ''} ${selectedValue ? styles.triggerSelected : ''}`}
      >
        {triggerLabel}
      </div>

      {isOpen && (
        <>
          <div className={styles.dropdown}>
            <div
              className={styles.cancelRow}
              onClick={() => {
                onSelect('');
                setIsOpen(false);
              }}
            >
              ✕ Cancel selection
            </div>
            <div className={styles.list}>
              {isLoading || isFetching ? (
                <div className={`${styles.listState} ${styles.listLoading}`}>
                  <span className={styles.spinner} aria-hidden />
                  Loading Google Meet recordings...
                </div>
              ) : isError ? (
                <div className={`${styles.listState} ${styles.listError}`}>
                  <div style={{ marginBottom: 10 }}>
                    {error?.response?.data?.error ||
                      error?.message ||
                      'Could not load recordings.'}
                  </div>
                  {error?.response?.data?.code === 'GOOGLE_NOT_CONNECTED' ? (
                    <button
                      type="button"
                      onClick={handleConnect}
                      className={`${styles.btn} ${styles.btnGoogle}`}
                    >
                      <img src="/google.svg" alt="" className={styles.btnIcon} />
                      Connect Google
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => refetch()}
                      className={`${styles.btn} ${styles.btnDanger}`}
                    >
                      Retry
                    </button>
                  )}
                </div>
              ) : recordings.length === 0 ? (
                <div className={styles.listState}>No Meet recordings found</div>
              ) : (
                recordings.map((recording) => {
                  const isSelected = selectedValue === recording.id;
                  return (
                    <div
                      key={recording.id}
                      onClick={() => {
                        onSelect(recording.id);
                        setIsOpen(false);
                      }}
                      className={`${styles.item} ${isSelected ? styles.itemSelected : ''}`}
                    >
                      <div>{recording.title || recording.name}</div>
                      <div className={styles.itemMeta}>
                        {recording.created_at_formated || '-'}
                        {recording.duration_furmated && recording.duration_furmated !== '-'
                          ? ` · ${recording.duration_furmated}`
                          : ''}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {showPagination && (
            <div className={styles.pagination}>
              <button
                type="button"
                onClick={() => hasPrev && setTokenHistory((prev) => prev.slice(0, -1))}
                disabled={!hasPrev}
                className={styles.pageBtn}
              >
                Previous {PAGE_SIZE}
              </button>
              <button
                type="button"
                onClick={() => hasNext && setTokenHistory((prev) => [...prev, nextPageToken])}
                disabled={!hasNext}
                className={styles.pageBtn}
              >
                Next {PAGE_SIZE}
              </button>
            </div>
          )}
        </>
      )}

      {disconnectOpen && (
        <div
          className={styles.overlay}
          onClick={() => !disconnectBusy && setDisconnectOpen(false)}
          role="presentation"
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="google-disconnect-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHead}>
              <div className={styles.modalIcon}>
                <img src="/unlink.svg" alt="" className={styles.modalIconImg} />
              </div>
              <h3 id="google-disconnect-title" className={styles.modalTitle}>
                Disconnect Google?
              </h3>
            </div>
            <div className={styles.modalBody}>
              This removes the shared Google connection for{' '}
              <strong>{status?.email || 'this account'}</strong>.
              <br />
              All staff will lose access until Google is connected again.
            </div>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={() => setDisconnectOpen(false)}
                disabled={disconnectBusy}
              >
                Keep connected
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnDanger}`}
                onClick={confirmDisconnect}
                disabled={disconnectBusy}
              >
                <img src="/unlink.svg" alt="" className={styles.btnIcon} />
                {disconnectBusy ? 'Disconnecting…' : 'Disconnect account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
