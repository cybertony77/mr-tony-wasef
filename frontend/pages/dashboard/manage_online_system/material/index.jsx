import { useNationalSystem, getCourseFieldLabels } from '../../../../lib/api/system';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TextInput, ActionIcon, useMantineTheme } from '@mantine/core';
import { IconSearch, IconArrowRight } from '@tabler/icons-react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import Title from '../../../../components/Title';
import CourseSelect from '../../../../components/CourseSelect';
import CourseTypeSelect from '../../../../components/CourseTypeSelect';
import CenterSelect from '../../../../components/CenterSelect';
import AccountStateSelect from '../../../../components/AccountStateSelect';
const PdfViewerModal = dynamic(() => import('../../../../components/PdfViewerModal'), { ssr: false });
import apiClient from '../../../../lib/axios';
import { downloadFileUrl } from '../../../../lib/downloadFileUrl';

function InputWithButton(props) {
  const theme = useMantineTheme();
  return (
    <TextInput
      radius="xl"
      size="md"
      placeholder="Search by material name..."
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

export default function MaterialPage() {
  const isNational = useNationalSystem();
  const courseLabels = getCourseFieldLabels(isNational);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [notePopup, setNotePopup] = useState(null);
  const [pdfViewer, setPdfViewer] = useState({ isOpen: false, url: '', name: '' });
  const successTimeoutRef = useRef(null);

  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCourse, setFilterCourse] = useState('');
  const [filterCourseType, setFilterCourseType] = useState('');
  const [filterCenter, setFilterCenter] = useState('');
  const [filterState, setFilterState] = useState('');
  const [courseOpen, setCourseOpen] = useState(false);
  const [courseTypeOpen, setCourseTypeOpen] = useState(false);
  const [centerOpen, setCenterOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['materials'],
    queryFn: async () => (await apiClient.get('/api/materials')).data,
    refetchOnWindowFocus: true,
  });

  const materials = data?.materials || [];
  const filtered = materials.filter((item) => {
    if (searchTerm.trim() && !(item.material_name || '').toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (filterCourse && item.course !== filterCourse) return false;
    if (filterCourseType && (item.courseType || '').trim().toLowerCase() !== filterCourseType.trim().toLowerCase()) return false;
    if (filterCenter && (item.center || '').trim().toLowerCase() !== filterCenter.trim().toLowerCase()) return false;
    if (filterState && (item.state || 'Activated') !== filterState) return false;
    return true;
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => (await apiClient.delete(`/api/materials?id=${id}`)).data,
    onSuccess: () => {
      setSuccessMessage('✅ Material deleted successfully!');
      setConfirmDeleteOpen(false);
      setSelectedMaterial(null);
      queryClient.invalidateQueries(['materials']);
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = setTimeout(() => setSuccessMessage(''), 6000);
    },
    onError: (err) => {
      const errorMsg = err.response?.data?.error || 'Failed to delete material';
      setSuccessMessage(errorMsg.startsWith('❌') ? errorMsg : `❌ ${errorMsg}`);
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = setTimeout(() => setSuccessMessage(''), 6000);
    },
  });

  useEffect(() => {
    if (!searchInput.trim() && searchTerm) setSearchTerm('');
  }, [searchInput, searchTerm]);

  const handleSearch = () => setSearchTerm(searchInput.trim());

  const openConfirmDeleteModal = (material) => {
    setSelectedMaterial(material);
    setConfirmDeleteOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (selectedMaterial) {
      deleteMutation.mutate(selectedMaterial._id);
    }
  };

  const handleDeleteCancel = () => {
    setConfirmDeleteOpen(false);
    setSelectedMaterial(null);
  };

  return (
    <div style={{ minHeight: '100vh', padding: '20px 5px' }}>
      <div style={{ maxWidth: 800, margin: '40px auto', padding: '20px 5px' }}>
        <Title backText="Back" href="/dashboard/manage_online_system">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Image src="/notes4.svg" alt="Material" width={30} height={30} />
            Material
          </div>
        </Title>

        <div style={{ marginBottom: 20 }}>
          <InputWithButton value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onButtonClick={handleSearch} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
        </div>

        <div className="filters-container" style={{ background: 'white', borderRadius: 16, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.1)', marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>{courseLabels.filterByCourse}</label>
              <CourseSelect selectedGrade={filterCourse} onGradeChange={setFilterCourse} showAllOption={true} isOpen={courseOpen} onToggle={() => { setCourseOpen(!courseOpen); setCourseTypeOpen(false); setCenterOpen(false); }} onClose={() => setCourseOpen(false)} />
            </div>
            {courseLabels.showCourseType && (
<div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Filter by Course Type</label>
              <CourseTypeSelect selectedCourseType={filterCourseType} onCourseTypeChange={setFilterCourseType} isOpen={courseTypeOpen} onToggle={() => { setCourseTypeOpen(!courseTypeOpen); setCourseOpen(false); setCenterOpen(false); }} onClose={() => setCourseTypeOpen(false)} />
            </div>
)}
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Filter by Center</label>
              <CenterSelect selectedCenter={filterCenter} onCenterChange={setFilterCenter} required={false} isOpen={centerOpen} onToggle={() => { setCenterOpen(!centerOpen); setCourseOpen(false); setCourseTypeOpen(false); }} onClose={() => setCenterOpen(false)} />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Filter by Material State</label>
              <AccountStateSelect value={filterState || null} onChange={(s) => setFilterState(s || '')} label="Material State" placeholder="Select Material State" style={{ marginBottom: 0, hideLabel: true }} />
            </div>
          </div>
        </div>

        <div className="material-container" style={{ background: 'white', borderRadius: 16, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.1)' }}>
          <div className="add-btn-container" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
            <button onClick={() => router.push('/dashboard/manage_online_system/material/add')} style={{ padding: '12px 24px', border: 'none', borderRadius: 12, background: '#1FA8DC', color: 'white', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <Image src="/plus.svg" alt="Add" width={20} height={20} style={{ marginRight: 6 }} />
              Add Material
            </button>
          </div>

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#6c757d' }}>Loading materials...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#6c757d' }}>{materials.length === 0 ? '❌ No materials found. Click "Add Material".' : '❌ No materials match your filters.'}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {filtered.map((item) => (
                <div
                  key={item._id}
                  className="material-item"
                  style={{
                    border: '2px solid #e9ecef',
                    borderRadius: 12,
                    padding: 20,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#1FA8DC';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(31, 168, 220, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e9ecef';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div className="material-item-content" style={{ flex: 1 }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: 8 }}>{[item.course, !isNational && item.courseType, item.center, item.material_name].filter(Boolean).join(' • ')}</div>
                    <div className="material-file-badge" style={{ padding: '12px 16px', border: '2px solid #e9ecef', borderRadius: 8, display: 'inline-block' }}>
                      <span style={{ color: (item.state || 'Activated') === 'Activated' ? '#28a745' : '#dc3545', fontWeight: 600 }}>{item.state || 'Activated'}</span>
                      <span style={{ margin: '0 8px' }}>•</span>
                      <span style={{ fontWeight: 600 }}>{`File Name : ${item.pdf_file_name || 'file'}.pdf`}</span>
                    </div>
                  </div>
                  <div className="material-buttons" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {item.pdf_url && (
                      <button onClick={() => downloadFileUrl(item.pdf_url, `${item.pdf_file_name || 'file'}.pdf`).catch((err) => alert(err.message || 'Download failed'))} style={{ padding: '8px 16px', background: '#32b750', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Image src="/pdf.svg" alt="PDF" width={18} height={18} />
                        Download PDF
                      </button>
                    )}
                    {item.pdf_url && (
                      <button
                        onClick={() => setPdfViewer({ isOpen: true, url: item.pdf_url, name: `${item.pdf_file_name || 'file'}.pdf` })}
                        style={{ padding: '8px 16px', background: '#0d6efd', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
                      >
                        <Image src="/external-link.svg" alt="Open PDF" width={18} height={18} />
                        Open PDF
                      </button>
                    )}
                    {item.comment && (
                      <button onClick={() => setNotePopup(item.comment)} style={{ padding: '8px 16px', background: '#1FA8DC', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Image src="/notes4.svg" alt="Notes" width={18} height={18} />
                        Notes
                      </button>
                    )}
                    <button onClick={() => router.push(`/dashboard/manage_online_system/material/edit?id=${item._id}`)} style={{ padding: '8px 16px', background: '#28a745', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Image src="/edit.svg" alt="Edit" width={18} height={18} />
                      Edit
                    </button>
                    <button onClick={() => openConfirmDeleteModal(item)} style={{ padding: '8px 16px', background: '#dc3545', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Image src="/trash2.svg" alt="Delete" width={18} height={18} />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Success / Error Message */}
          {successMessage && (
            <div style={{
              background: successMessage.startsWith('❌') ? '#fee2e2' : '#d4edda',
              color: successMessage.startsWith('❌') ? '#991b1b' : '#155724',
              borderRadius: 10,
              padding: 16,
              marginTop: 24,
              textAlign: 'center',
              fontWeight: 600,
              border: successMessage.startsWith('❌') ? '1.5px solid #fca5a5' : '1.5px solid #c3e6cb',
              fontSize: '1.1rem',
              boxShadow: successMessage.startsWith('❌') ? '0 4px 16px rgba(220, 53, 69, 0.08)' : '0 4px 16px rgba(40, 167, 69, 0.08)'
            }}>
              {successMessage}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmDeleteOpen && (
        <div
          className="confirm-modal"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleDeleteCancel();
            }
          }}
        >
          <div
            className="confirm-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: '16px',
              padding: '32px',
              maxWidth: '400px',
              width: '100%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: '16px', textAlign: 'center' }}>
              Confirm Delete
            </h3>
            <p style={{ textAlign: 'center', marginBottom: '24px', color: '#6c757d' }}>
              Are you sure you want to delete &quot;{selectedMaterial?.material_name}&quot;? This action cannot be undone.
            </p>
            <div className="confirm-buttons" style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleteMutation.isLoading}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: deleteMutation.isLoading ? 'not-allowed' : 'pointer',
                  fontSize: '1rem',
                  fontWeight: '600',
                  opacity: deleteMutation.isLoading ? 0.7 : 1
                }}
              >
                {deleteMutation.isLoading ? 'Deleting...' : 'Delete'}
              </button>
              <button
                onClick={handleDeleteCancel}
                disabled={deleteMutation.isLoading}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: deleteMutation.isLoading ? 'not-allowed' : 'pointer',
                  fontSize: '1rem',
                  fontWeight: '600',
                  opacity: deleteMutation.isLoading ? 0.7 : 1
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {notePopup && (
        <div onClick={() => setNotePopup(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: 20, maxWidth: 500, width: '100%', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg, #1FA8DC 0%, #17a2b8 100%)', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Image src="/notes4.svg" alt="Notes" width={22} height={22} style={{ filter: 'brightness(0) invert(1)' }} />
                <h3 style={{ margin: 0, color: 'white' }}>Note</h3>
              </div>
              <button onClick={() => setNotePopup(null)} style={{ background: '#dc3545', color: 'white', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: 24, color: '#495057', whiteSpace: 'pre-wrap' }}>{notePopup}</div>
          </div>
        </div>
      )}

      <PdfViewerModal
        isOpen={pdfViewer.isOpen}
        fileUrl={pdfViewer.url}
        fileName={pdfViewer.name}
        onClose={() => setPdfViewer({ isOpen: false, url: '', name: '' })}
      />

      <style jsx>{`
        .material-item {
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        @media (max-width: 768px) {
          .filters-container,
          .material-container {
            padding: 16px !important;
          }
          .add-btn-container button {
            width: 100%;
            justify-content: center;
          }
          .material-item {
            flex-direction: column !important;
            align-items: stretch !important;
            padding: 14px !important;
          }
          .material-item-content,
          .material-file-badge {
            width: 100%;
            box-sizing: border-box;
          }
          .material-buttons {
            width: 100%;
            flex-direction: column;
          }
          .material-buttons button {
            width: 100%;
            justify-content: center;
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
        }
      `}</style>
    </div>
  );
}
