import { useEffect, useMemo, useState } from 'react';
import { useNationalSystem, getCourseFieldLabels } from '../lib/api/system';
import { ActionIcon, Checkbox, Loader, TextInput, useMantineTheme } from '@mantine/core';
import { IconArrowRight, IconSearch, IconUsers } from '@tabler/icons-react';
import CourseSelect from './CourseSelect';
import CourseTypeSelect from './CourseTypeSelect';
import CenterSelect from './CenterSelect';
import { useStudentsPaginated } from '../lib/api/students';
import { parseStudentsCsv, studentsCsvFromIds } from '../lib/certificatesUtils';

const SEARCH_PLACEHOLDER = 'Search by ID, Name or Student Phone';

function InputWithButton({ onButtonClick, onKeyDown, ...props }) {
  const theme = useMantineTheme();
  return (
    <TextInput
      radius="xl"
      size="md"
      placeholder={SEARCH_PLACEHOLDER}
      rightSectionWidth={42}
      leftSection={<IconSearch size={18} stroke={1.5} />}
      rightSection={
        <ActionIcon
          size={32}
          radius="xl"
          color={theme.primaryColor}
          variant="filled"
          onClick={onButtonClick}
          style={{ cursor: 'pointer' }}
          aria-label="Search"
        >
          <IconArrowRight size={18} stroke={1.5} />
        </ActionIcon>
      }
      onKeyDown={onKeyDown}
      styles={{
        input: {
          border: '1.5px solid rgba(31, 168, 220, 0.25)',
          background: 'linear-gradient(145deg, #ffffff, #f8fafc)',
          fontWeight: 600,
          '&:focus': {
            borderColor: '#1FA8DC',
          },
        },
      }}
      {...props}
    />
  );
}

/**
 * Multi-select students with course / course type / center filters + pagination.
 * Value is comma-separated IDs string (e.g. "1, 3, 6").
 */
export default function CertificateStudentsSelect({ value = '', onChange, error }) {
  const isNational = useNationalSystem();
  const courseLabels = getCourseFieldLabels(isNational);
  const selectedIds = useMemo(() => parseStudentsCsv(value), [value]);
  const selectedSet = useMemo(() => new Set(selectedIds.map(String)), [selectedIds]);

  const [filterCourse, setFilterCourse] = useState('');
  const [filterCourseType, setFilterCourseType] = useState('');
  const [filterCenter, setFilterCenter] = useState('');
  const [courseOpen, setCourseOpen] = useState(false);
  const [courseTypeOpen, setCourseTypeOpen] = useState(false);
  const [centerOpen, setCenterOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    setCurrentPage(1);
  }, [filterCourse, filterCourseType, filterCenter, searchTerm]);

  useEffect(() => {
    if (searchInput.trim() === '' && searchTerm !== '') setSearchTerm('');
  }, [searchInput, searchTerm]);

  const { data, isLoading, isFetching } = useStudentsPaginated({
    page: currentPage,
    limit: pageSize,
    search: searchTerm,
    course: filterCourse && filterCourse.toLowerCase() !== 'all' ? filterCourse : undefined,
    courseType: filterCourseType && filterCourseType.toLowerCase() !== 'all' ? filterCourseType : undefined,
    center: filterCenter && filterCenter.toLowerCase() !== 'all' ? filterCenter : undefined,
    sortBy: 'id',
    sortOrder: 'asc',
  });

  const students = data?.data || data?.students || [];
  const pagination = data?.pagination || {
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
    hasNextPage: false,
    hasPrevPage: false,
  };

  const toggleStudent = (id) => {
    const sid = String(id);
    const next = new Set(selectedSet);
    if (next.has(sid)) next.delete(sid);
    else next.add(sid);
    onChange(studentsCsvFromIds([...next]));
  };

  const removeSelected = (id) => {
    onChange(studentsCsvFromIds(selectedIds.filter((x) => String(x) !== String(id))));
  };

  const clearAll = () => onChange('');

  const handleSearch = () => {
    setSearchTerm(searchInput.trim());
    setCurrentPage(1);
  };

  return (
    <div
      className="cert-students-select"
      data-cert-error={error ? 'true' : undefined}
      style={{
        padding: 3,
        borderRadius: 18,
        background: error
          ? 'linear-gradient(135deg, rgba(239,68,68,0.55), rgba(248,113,113,0.4))'
          : 'linear-gradient(135deg, rgba(31,168,220,0.45), rgba(254,185,84,0.4) 55%, rgba(14,165,233,0.35))',
        boxShadow: error
          ? '0 12px 32px rgba(220, 53, 69, 0.16)'
          : '0 12px 32px rgba(31, 168, 220, 0.1)',
      }}
    >
      <div
        className="cert-students-inner"
        style={{
          borderRadius: 15,
          background: 'linear-gradient(165deg, #ffffff 0%, #f8fafc 100%)',
          overflow: 'visible',
        }}
      >
        <div
          className="cert-students-header"
          style={{
            padding: '16px 18px',
            background: 'linear-gradient(120deg, rgba(31,168,220,0.12), rgba(254,185,84,0.1))',
            borderBottom: '1px solid rgba(31, 168, 220, 0.15)',
            borderRadius: '15px 15px 0 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background: 'linear-gradient(145deg, #1FA8DC, #0ea5e9)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                boxShadow: '0 8px 18px rgba(31, 168, 220, 0.3)',
                flexShrink: 0,
              }}
            >
              <IconUsers size={20} stroke={2} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1.02rem' }}>Select Students</div>
              <div style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600, marginTop: 2 }}>
                {selectedIds.length} selected · shown as id : name • {isNational ? 'grade' : 'course • course type'} • main center
              </div>
            </div>
          </div>
          {selectedIds.length > 0 && (
            <button
              type="button"
              className="cert-students-clear"
              onClick={clearAll}
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                border: '1px solid rgba(220, 53, 69, 0.25)',
                background: '#fff5f5',
                color: '#dc3545',
                fontWeight: 800,
                fontSize: '0.78rem',
                cursor: 'pointer',
              }}
            >
              Clear all
            </button>
          )}
        </div>

        {selectedIds.length > 0 && (
          <div
            className="cert-students-chips"
            style={{
              padding: '12px 16px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              borderBottom: '1px solid rgba(31, 168, 220, 0.12)',
              background: 'linear-gradient(180deg, #f0f9ff 0%, #ffffff 100%)',
            }}
          >
            {selectedIds.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => removeSelected(id)}
                title="Remove student"
                style={{
                  border: '1px solid rgba(31, 168, 220, 0.35)',
                  background: 'linear-gradient(145deg, #ebf8ff, #ffffff)',
                  color: '#0369a1',
                  borderRadius: 999,
                  padding: '7px 12px',
                  fontWeight: 800,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 10px rgba(31, 168, 220, 0.1)',
                  transition: 'transform 0.15s ease',
                }}
              >
                ID {id} ✕
              </button>
            ))}
          </div>
        )}

        <div className="cert-students-body" style={{ padding: 16, display: 'grid', gap: 14, overflow: 'visible' }}>
          <InputWithButton
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onButtonClick={handleSearch}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder={SEARCH_PLACEHOLDER}
          />

          <div
            className="cert-students-filters"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 12,
              overflow: 'visible',
              padding: 12,
              borderRadius: 14,
              background: 'linear-gradient(145deg, #ffffff, #f8fafc)',
              border: '1px solid rgba(31, 168, 220, 0.14)',
            }}
          >
            <div className="cert-students-filter" style={{ overflow: 'visible', minWidth: 0 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, color: '#334155', fontSize: '0.88rem' }}>
                {courseLabels.filterByCourse}
              </label>
              <CourseSelect
                selectedGrade={filterCourse}
                onGradeChange={setFilterCourse}
                showAllOption={true}
                required={false}
                isOpen={courseOpen}
                onToggle={() => {
                  setCourseOpen(!courseOpen);
                  setCourseTypeOpen(false);
                  setCenterOpen(false);
                }}
                onClose={() => setCourseOpen(false)}
              />
            </div>
            {courseLabels.showCourseType && (
<div className="cert-students-filter" style={{ overflow: 'visible', minWidth: 0 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, color: '#334155', fontSize: '0.88rem' }}>
                Filter by Course Type
              </label>
              <CourseTypeSelect
                selectedCourseType={filterCourseType}
                onCourseTypeChange={setFilterCourseType}
                isOpen={courseTypeOpen}
                onToggle={() => {
                  setCourseTypeOpen(!courseTypeOpen);
                  setCourseOpen(false);
                  setCenterOpen(false);
                }}
                onClose={() => setCourseTypeOpen(false)}
              />
            </div>
)}
            <div className="cert-students-filter" style={{ overflow: 'visible', minWidth: 0 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, color: '#334155', fontSize: '0.88rem' }}>
                Filter by Center
              </label>
              <CenterSelect
                selectedCenter={filterCenter}
                onCenterChange={setFilterCenter}
                required={false}
                isOpen={centerOpen}
                onToggle={() => {
                  setCenterOpen(!centerOpen);
                  setCourseOpen(false);
                  setCourseTypeOpen(false);
                }}
                onClose={() => setCenterOpen(false)}
              />
            </div>
          </div>

          <div
            className="cert-students-list"
            style={{
              position: 'relative',
              minHeight: 200,
              maxHeight: 360,
              overflowY: 'auto',
              borderRadius: 14,
              border: '1.5px solid rgba(31, 168, 220, 0.2)',
              background: '#fff',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)',
            }}
          >
            {(isLoading || isFetching) && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  background: 'rgba(255,255,255,0.78)',
                  backdropFilter: 'blur(2px)',
                  zIndex: 1,
                }}
              >
                <Loader size="sm" color="cyan" />
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0369a1' }}>Loading students…</span>
              </div>
            )}
            {students.length === 0 && !isLoading ? (
              <div style={{ padding: 36, textAlign: 'center' }}>
                <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>No students found</div>
                <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>
                  Try another filter or search term
                </div>
              </div>
            ) : (
              students.map((s) => {
                const id = String(s.id);
                const checked = selectedSet.has(id);
                return (
                  <label
                    key={id}
                    className="cert-students-row"
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: '13px 14px',
                      borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer',
                      background: checked
                        ? 'linear-gradient(90deg, rgba(31,168,220,0.12), rgba(254,185,84,0.06))'
                        : 'transparent',
                      borderLeft: checked ? '3px solid #1FA8DC' : '3px solid transparent',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <Checkbox checked={checked} onChange={() => toggleStudent(id)} mt={2} color="cyan" />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: '0.92rem',
                          color: '#0f172a',
                          fontWeight: 800,
                          lineHeight: 1.35,
                          wordBreak: 'break-word',
                        }}
                      >
                        {id} : {s.name || '—'}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          marginTop: 3,
                          fontSize: '0.78rem',
                          color: '#64748b',
                          fontWeight: 600,
                          wordBreak: 'break-word',
                        }}
                      >
                        {[s.course || '—', !isNational && (s.courseType || '—'), s.main_center || s.center || '—'].filter(Boolean).join(' • ')}
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>

          {pagination.totalCount > 0 && (
            <div
              className="cert-students-pagination"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                flexWrap: 'wrap',
                padding: '4px 2px',
              }}
            >
              <button
                type="button"
                className="cert-students-page-btn"
                disabled={!pagination.hasPrevPage}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                style={{
                  padding: '10px 16px',
                  borderRadius: 12,
                  border: 'none',
                  background: pagination.hasPrevPage
                    ? 'linear-gradient(135deg, #1FA8DC, #0ea5e9)'
                    : '#ced4da',
                  color: '#fff',
                  fontWeight: 800,
                  cursor: pagination.hasPrevPage ? 'pointer' : 'not-allowed',
                  boxShadow: pagination.hasPrevPage ? '0 8px 16px rgba(31, 168, 220, 0.25)' : 'none',
                }}
              >
                Previous
              </button>
              <span className="cert-students-page-info" style={{ fontWeight: 800, color: '#475569', fontSize: '0.88rem' }}>
                Page {pagination.currentPage} of {pagination.totalPages} · {pagination.totalCount} students
              </span>
              <button
                type="button"
                className="cert-students-page-btn"
                disabled={!pagination.hasNextPage}
                onClick={() => setCurrentPage((p) => p + 1)}
                style={{
                  padding: '10px 16px',
                  borderRadius: 12,
                  border: 'none',
                  background: pagination.hasNextPage
                    ? 'linear-gradient(135deg, #1FA8DC, #0ea5e9)'
                    : '#ced4da',
                  color: '#fff',
                  fontWeight: 800,
                  cursor: pagination.hasNextPage ? 'pointer' : 'not-allowed',
                  boxShadow: pagination.hasNextPage ? '0 8px 16px rgba(31, 168, 220, 0.25)' : 'none',
                }}
              >
                Next
              </button>
            </div>
          )}
        </div>
        {error && (
          <div
            style={{
              margin: '0 16px 14px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              padding: '10px 12px',
              borderRadius: 10,
              background: 'linear-gradient(135deg, #fff5f5 0%, #fee2e2 100%)',
              border: '1px solid rgba(248, 113, 113, 0.45)',
              boxShadow: '0 6px 16px rgba(220, 53, 69, 0.08)',
            }}
          >
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: 999,
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(145deg, #ef4444, #dc2626)',
                color: '#fff',
                fontSize: '0.72rem',
                fontWeight: 800,
              }}
            >
              !
            </span>
            <span style={{ color: '#991b1b', fontSize: '0.86rem', fontWeight: 700, lineHeight: 1.4 }}>
              {String(error).replace(/^❌\s*/, '')}
            </span>
          </div>
        )}
      </div>

      <style jsx>{`
        @media (max-width: 768px) {
          .cert-students-header {
            padding: 14px !important;
          }
          .cert-students-clear {
            width: 100%;
            text-align: center;
          }
          .cert-students-body {
            padding: 12px !important;
            gap: 12px !important;
          }
          .cert-students-filters {
            grid-template-columns: 1fr !important;
            padding: 10px !important;
          }
          .cert-students-filter {
            width: 100%;
          }
          .cert-students-list {
            max-height: 300px !important;
            min-height: 160px !important;
          }
          .cert-students-row {
            padding: 12px 10px !important;
          }
          .cert-students-pagination {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .cert-students-page-btn {
            width: 100%;
          }
          .cert-students-page-info {
            order: -1;
            text-align: center;
            width: 100%;
            font-size: 0.82rem !important;
          }
        }
      `}</style>
    </div>
  );
}
