import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TextInput, ActionIcon, useMantineTheme } from '@mantine/core';
import { IconSearch, IconArrowRight } from '@tabler/icons-react';
import Image from 'next/image';
import Title from '../../../components/Title';
import AccountStateSelect from '../../../components/AccountStateSelect';
import apiClient from '../../../lib/axios';
import { parseStudentsCsv } from '../../../lib/certificatesUtils';
import styles from '../../../styles/StudentCertificates.module.css';

function InputWithButton(props) {
  const theme = useMantineTheme();
  return (
    <TextInput
      radius="xl"
      size="md"
      placeholder="Search by certificate name..."
      rightSectionWidth={42}
      leftSection={<IconSearch size={18} stroke={1.5} />}
      rightSection={
        <ActionIcon size={32} radius="xl" color={theme.primaryColor} variant="filled" onClick={props.onButtonClick}>
          <IconArrowRight size={18} stroke={1.5} />
        </ActionIcon>
      }
      {...props}
    />
  );
}

async function fetchPreviewBlob(certId) {
  const response = await apiClient.get(`/api/certificates/preview?id=${certId}`, {
    responseType: 'blob',
  });
  const contentType = response.headers['content-type'] || '';
  if (contentType.includes('application/json')) {
    const text = await response.data.text();
    const parsed = JSON.parse(text);
    throw new Error(parsed.error || 'Failed to load certificate preview');
  }
  const raw = response.data;
  const bytes = raw instanceof Blob ? await raw.arrayBuffer() : raw;
  return new Blob([bytes], { type: 'image/png' });
}

export default function CertificatesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [selectedCertificate, setSelectedCertificate] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const successTimeoutRef = useRef(null);

  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterState, setFilterState] = useState('');

  const [openId, setOpenId] = useState(null);
  const [previewState, setPreviewState] = useState({});

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['certificates'],
    queryFn: async () => (await apiClient.get('/api/certificates')).data,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  });

  useEffect(() => {
    const onFocus = () => refetch();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refetch]);

  useEffect(() => {
    const handleRoute = () => {
      refetch();
    };
    router.events.on('routeChangeComplete', handleRoute);
    return () => router.events.off('routeChangeComplete', handleRoute);
  }, [router.events, refetch]);

  useEffect(() => {
    return () => {
      Object.values(previewState).forEach((s) => {
        if (s?.url) URL.revokeObjectURL(s.url);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const certificates = data?.certificates || [];
  const filtered = certificates.filter((item) => {
    if (searchTerm.trim() && !(item.certificate_name || '').toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    if (filterState && (item.state || 'Activated') !== filterState) return false;
    return true;
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => (await apiClient.delete(`/api/certificates?id=${id}`)).data,
    onSuccess: () => {
      setSuccessMessage('✅ Certificate deleted successfully!');
      setConfirmDeleteOpen(false);
      setSelectedCertificate(null);
      queryClient.invalidateQueries(['certificates']);
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = setTimeout(() => setSuccessMessage(''), 6000);
    },
    onError: (err) => {
      const errorMsg = err.response?.data?.error || 'Failed to delete certificate';
      setSuccessMessage(errorMsg.startsWith('❌') ? errorMsg : `❌ ${errorMsg}`);
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = setTimeout(() => setSuccessMessage(''), 6000);
    },
  });

  useEffect(() => {
    if (!searchInput.trim() && searchTerm) setSearchTerm('');
  }, [searchInput, searchTerm]);

  const handleSearch = () => setSearchTerm(searchInput.trim());

  const clearPreviewUrl = (id) => {
    setPreviewState((prev) => {
      const cur = prev[id];
      if (cur?.url) URL.revokeObjectURL(cur.url);
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const loadPreview = async (cert) => {
    const id = String(cert._id);
    setPreviewState((prev) => ({ ...prev, [id]: { status: 'loading' } }));
    try {
      const blob = await fetchPreviewBlob(cert._id);
      const url = URL.createObjectURL(blob);
      setPreviewState((prev) => {
        if (prev[id]?.url) URL.revokeObjectURL(prev[id].url);
        return { ...prev, [id]: { status: 'ready', url } };
      });
    } catch (err) {
      let msg = err.message || 'Could not load certificate preview';
      if (err.response?.data instanceof Blob) {
        try {
          msg = JSON.parse(await err.response.data.text()).error || msg;
        } catch {
          /* keep */
        }
      }
      setPreviewState((prev) => ({ ...prev, [id]: { status: 'error', message: msg } }));
    }
  };

  const handleToggleView = (cert) => {
    const id = String(cert._id);
    setOpenId((prev) => {
      if (prev === id) {
        clearPreviewUrl(id);
        return null;
      }
      if (prev) clearPreviewUrl(prev);
      loadPreview(cert);
      return id;
    });
  };

  return (
    <div style={{ minHeight: '100vh', padding: '20px 5px' }}>
      <div style={{ maxWidth: 800, margin: '40px auto', padding: '20px 5px', boxSizing: 'border-box', width: '100%' }}>
        <Title backText="Back" href="/dashboard">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Image src="/certificate.svg" alt="Certificates" width={30} height={30} />
            Certificates
          </div>
        </Title>

        <div style={{ marginBottom: 20 }}>
          <InputWithButton
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onButtonClick={handleSearch}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search by certificate name..."
          />
        </div>

        <div
          className="filters-container"
          style={{
            background: 'white',
            borderRadius: 16,
            padding: 24,
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
            marginBottom: 24,
            overflow: 'visible',
          }}
        >
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Filter by Certificate State</label>
          <AccountStateSelect
            value={filterState || null}
            onChange={(s) => setFilterState(s || '')}
            label="Certificate State"
            placeholder="Select Certificate State"
            style={{ marginBottom: 0, hideLabel: true }}
          />
        </div>

        <div
          className="certificates-container"
          style={{ background: 'white', borderRadius: 16, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.1)' }}
        >
          <div className="add-btn-container" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
            <button
              type="button"
              onClick={() => router.push('/dashboard/certificates/add')}
              style={{
                padding: '12px 24px',
                border: 'none',
                borderRadius: 12,
                background: '#1FA8DC',
                color: 'white',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Image src="/plus.svg" alt="Add" width={20} height={20} style={{ marginRight: 6 }} />
              Add Certificate
            </button>
          </div>

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#6c757d' }}>Loading certificates...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#6c757d' }}>
              {certificates.length === 0
                ? '❌ No certificates found. Click "Add Certificate".'
                : '❌ No certificates match your filters.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filtered.map((item) => {
                const count = parseStudentsCsv(item.students).length;
                const active = (item.state || 'Activated') === 'Activated';
                const id = String(item._id);
                const isOpen = openId === id;
                const state = previewState[id];
                const isLoadingCert = isOpen && state?.status === 'loading';
                const isReady = isOpen && state?.status === 'ready';
                const isError = isOpen && state?.status === 'error';

                return (
                  <div
                    key={id}
                    className="certificate-item"
                    onClick={() => handleToggleView(item)}
                    style={{
                      backgroundColor: '#f8f9fa',
                      borderRadius: 8,
                      padding: 16,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div
                      className="certificate-item-row"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        marginBottom: isOpen ? 12 : 0,
                      }}
                    >
                      <div className="certificate-item-content" style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: '1.05rem',
                            fontWeight: 700,
                            color: '#212529',
                            marginBottom: 6,
                            wordBreak: 'break-word',
                          }}
                        >
                          {item.certificate_name}
                        </div>
                        <div
                          style={{
                            fontSize: '0.9rem',
                            color: '#6c757d',
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <span style={{ color: active ? '#28a745' : '#dc3545', fontWeight: 600 }}>
                            {item.state || 'Activated'}
                          </span>
                          <span>•</span>
                          <span>
                            {count} student{count === 1 ? '' : 's'}
                          </span>
                          {item.create_date && (
                            <>
                              <span>•</span>
                              <span>{item.create_date}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div
                        className="certificate-buttons"
                        style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/dashboard/certificates/edit?id=${item._id}`);
                          }}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#1FA8DC',
                            color: 'white',
                            border: 'none',
                            borderRadius: 6,
                            fontSize: '0.875rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            fontWeight: 600,
                          }}
                          title="Edit certificate"
                        >
                          <Image src="/edit.svg" alt="Edit" width={18} height={18} />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCertificate(item);
                            setConfirmDeleteOpen(true);
                          }}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: 6,
                            fontSize: '0.875rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            fontWeight: 600,
                          }}
                          title="Delete certificate"
                        >
                          <Image src="/trash2.svg" alt="Delete" width={18} height={18} />
                          Delete
                        </button>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 24,
                            height: 24,
                            color: '#1FA8DC',
                            marginLeft: 8,
                          }}
                          aria-hidden
                        >
                          <Image
                            src={isOpen ? '/chevron-down.svg' : '/chevron-right.svg'}
                            alt=""
                            width={20}
                            height={20}
                          />
                        </div>
                      </div>
                    </div>

                    {isOpen && (
                      <div
                        style={{ marginTop: 4, paddingTop: 16, borderTop: '1px solid #eee' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className={styles.viewerShell}>
                          <div className={styles.viewerWrap}>
                            {isLoadingCert && (
                              <div className={styles.spinnerOverlay} aria-live="polite">
                                <div className={styles.loaderStack}>
                                  <div className={styles.spinner} />
                                  <div className={styles.loaderPulse} />
                                </div>
                                <p className={styles.spinnerText}>Generating certificate…</p>
                                <p className={styles.spinnerSub}>Preview with Student Name</p>
                              </div>
                            )}

                            {isError && (
                              <div className={styles.errorBox} role="alert">
                                <Image src="/alert-triangle2.svg" alt="" width={28} height={28} />
                                <p className={styles.errorTitle}>Preview unavailable</p>
                                <p className={styles.errorText}>{state.message}</p>
                                <button
                                  type="button"
                                  className={styles.retryBtn}
                                  onClick={() => loadPreview(item)}
                                >
                                  Try again
                                </button>
                              </div>
                            )}

                            {isReady && state.url && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img className={styles.certImage} src={state.url} alt={item.certificate_name} />
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {successMessage && (
            <div
              style={{
                background: successMessage.startsWith('❌') ? '#fee2e2' : '#d4edda',
                color: successMessage.startsWith('❌') ? '#991b1b' : '#155724',
                borderRadius: 10,
                padding: 16,
                marginTop: 24,
                textAlign: 'center',
                fontWeight: 600,
                border: successMessage.startsWith('❌') ? '1.5px solid #fca5a5' : '1.5px solid #c3e6cb',
                fontSize: '1.1rem',
              }}
            >
              {successMessage}
            </div>
          )}
        </div>
      </div>

      {confirmDeleteOpen && (
        <div
          className="confirm-modal"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setConfirmDeleteOpen(false);
              setSelectedCertificate(null);
            }
          }}
        >
          <div
            className="confirm-content"
            style={{
              background: 'white',
              borderRadius: 16,
              padding: 32,
              maxWidth: 400,
              width: '100%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              boxSizing: 'border-box',
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 16, textAlign: 'center' }}>Confirm Delete</h3>
            <p style={{ textAlign: 'center', marginBottom: 24, color: '#6c757d' }}>
              Are you sure you want to delete &quot;{selectedCertificate?.certificate_name}&quot;? This action cannot be
              undone.
            </p>
            <div className="confirm-buttons" style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => selectedCertificate && deleteMutation.mutate(selectedCertificate._id)}
                disabled={deleteMutation.isPending}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontWeight: 600,
                  opacity: deleteMutation.isPending ? 0.7 : 1,
                }}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmDeleteOpen(false);
                  setSelectedCertificate(null);
                }}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .certificate-item {
          transition: all 0.2s ease;
        }
        @media (max-width: 768px) {
          .filters-container,
          .certificates-container {
            padding: 16px !important;
          }
          .add-btn-container button {
            width: 100%;
            justify-content: center;
          }
          .certificate-item {
            padding: 14px !important;
          }
          .certificate-item-row {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .certificate-item-content {
            width: 100%;
            box-sizing: border-box;
          }
          .certificate-buttons {
            width: 100%;
            flex-wrap: wrap;
            justify-content: flex-end;
          }
          .certificate-buttons button {
            flex: 1;
            justify-content: center;
            min-height: 40px;
          }
          .confirm-modal {
            padding: 10px !important;
          }
          .confirm-content {
            margin: 5px;
          }
          .confirm-content h3 {
            font-size: 1.1rem !important;
            margin-bottom: 12px !important;
          }
          .confirm-content p {
            font-size: 0.9rem !important;
            margin-bottom: 20px !important;
          }
          .confirm-content button {
            padding: 8px 16px !important;
            font-size: 0.9rem !important;
          }
          .confirm-buttons {
            width: 100%;
          }
          .confirm-buttons button {
            flex: 1;
          }
        }
      `}</style>
    </div>
  );
}
