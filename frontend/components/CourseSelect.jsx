import { useMemo, useState } from 'react';
import { useSystemConfig, useNationalSystem, getCourseFieldLabels } from '../lib/api/system';

function OptionWithCount({ label, count, showCount }) {
  if (!showCount || count == null) return <>{label}</>;
  const n = Number(count);
  const safe = Number.isFinite(n) ? Math.max(0, n) : 0;
  const isZero = safe === 0;
  return (
    <>
      {label}{' '}
      (
      <span style={{ color: isZero ? '#dc3545' : 'inherit', fontWeight: isZero ? 700 : 500 }}>
        {safe} {safe === 1 ? 'student' : 'students'}
      </span>
      )
    </>
  );
}

export default function CourseSelect({
  selectedGrade,
  onGradeChange,
  required = false,
  isOpen,
  onToggle,
  onClose,
  showAllOption = false,
  placeholder,
  /** Optional: (courseName) => number — shows "(N students)" in options */
  optionCount,
}) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const actualIsOpen = isOpen !== undefined ? isOpen : internalIsOpen;
  const actualOnToggle = onToggle || (() => setInternalIsOpen((open) => !open));
  const actualOnClose = onClose || (() => setInternalIsOpen(false));

  const { data: systemConfig } = useSystemConfig();
  const isNational = useNationalSystem();
  const labels = getCourseFieldLabels(isNational);
  const emptyLabel = placeholder || labels.selectCourse;
  const showCount = typeof optionCount === 'function';

  const grades = useMemo(() => {
    const fromEnv = Array.isArray(systemConfig?.grades_or_courses)
      ? systemConfig.grades_or_courses
          .map((item) => String(item ?? '').trim())
          .filter(Boolean)
      : [];

    if (!showAllOption) return fromEnv;

    const hasAll = fromEnv.some((item) => item.toLowerCase() === 'all');
    return hasAll ? fromEnv : [...fromEnv, 'All'];
  }, [systemConfig?.grades_or_courses, showAllOption]);

  const handleGradeSelect = (grade) => {
    onGradeChange(grade);
    actualOnClose();
  };

  const selectedCount = showCount && selectedGrade ? optionCount(selectedGrade) : null;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div
        style={{
          padding: '14px 16px',
          border: actualIsOpen ? '2px solid #1FA8DC' : '2px solid #e9ecef',
          borderRadius: '10px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '1rem',
          color: selectedGrade ? '#1FA8DC' : '#adb5bd',
          backgroundColor: selectedGrade ? '#f0f8ff' : '#ffffff',
          fontWeight: selectedGrade ? '600' : '400',
          transition: 'all 0.3s ease',
          boxShadow: actualIsOpen ? '0 0 0 3px rgba(31, 168, 220, 0.1)' : 'none',
        }}
        onClick={actualOnToggle}
      >
        <span>
          {selectedGrade ? (
            <OptionWithCount label={selectedGrade} count={selectedCount} showCount={showCount} />
          ) : (
            emptyLabel
          )}
        </span>
      </div>

      {actualIsOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            backgroundColor: '#ffffff',
            border: '2px solid #e9ecef',
            borderRadius: '10px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
            zIndex: 1000,
            maxHeight: '280px',
            overflowY: 'auto',
            marginTop: '4px',
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              cursor: 'pointer',
              borderBottom: '1px solid #f8f9fa',
              color: '#dc3545',
              fontWeight: '500',
            }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleGradeSelect('')}
          >
            ✕ Clear selection
          </div>
          {grades.map((grade) => {
            const count = showCount ? optionCount(grade) : null;
            return (
              <div
                key={grade}
                style={{
                  padding: '12px 16px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f8f9fa',
                  color: selectedGrade === grade ? '#1FA8DC' : '#000000',
                  backgroundColor: selectedGrade === grade ? '#f0f8ff' : '#ffffff',
                  fontWeight: selectedGrade === grade ? '600' : '400',
                }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleGradeSelect(grade)}
                onMouseEnter={(e) => {
                  if (selectedGrade !== grade) e.currentTarget.style.backgroundColor = '#f8f9fa';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor =
                    selectedGrade === grade ? '#f0f8ff' : '#ffffff';
                }}
              >
                <OptionWithCount label={grade} count={count} showCount={showCount} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
