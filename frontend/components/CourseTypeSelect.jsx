import { useMemo, useState } from 'react';
import { useSystemConfig, useNationalSystem } from '../lib/api/system';

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

export default function CourseTypeSelect({
  selectedCourseType,
  onCourseTypeChange,
  required = false,
  isOpen,
  onToggle,
  onClose,
  /** Optional: (courseType) => number — shows "(N students)" in options */
  optionCount,
}) {
  const isNational = useNationalSystem();
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const actualIsOpen = isOpen !== undefined ? isOpen : internalIsOpen;
  const actualOnToggle = onToggle || (() => setInternalIsOpen(!internalIsOpen));
  const actualOnClose = onClose || (() => setInternalIsOpen(false));

  const { data: systemConfig } = useSystemConfig();
  const showCount = typeof optionCount === 'function';

  const courseTypes = useMemo(() => {
    const fromEnv = Array.isArray(systemConfig?.course_type)
      ? systemConfig.course_type
          .map((item) => String(item ?? '').trim())
          .filter(Boolean)
      : [];
    return fromEnv;
  }, [systemConfig?.course_type]);

  const handleCourseTypeSelect = (courseType) => {
    onCourseTypeChange(courseType);
    actualOnClose();
  };

  // National systems do not use course type
  if (isNational) return null;

  const selectedCount =
    showCount && selectedCourseType ? optionCount(selectedCourseType) : null;

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
          color: selectedCourseType ? '#1FA8DC' : '#adb5bd',
          backgroundColor: selectedCourseType ? '#f0f8ff' : '#ffffff',
          fontWeight: selectedCourseType ? '600' : '400',
          transition: 'all 0.3s ease',
          boxShadow: actualIsOpen ? '0 0 0 3px rgba(31, 168, 220, 0.1)' : 'none',
        }}
        onClick={actualOnToggle}
        onBlur={() => setTimeout(actualOnClose, 200)}
      >
        <span>
          {selectedCourseType ? (
            <OptionWithCount
              label={selectedCourseType}
              count={selectedCount}
              showCount={showCount}
            />
          ) : (
            'Select Course Type'
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
            maxHeight: '200px',
            overflowY: 'auto',
            marginTop: '4px',
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              cursor: 'pointer',
              borderBottom: '1px solid #f8f9fa',
              transition: 'background-color 0.2s ease',
              color: '#dc3545',
              fontWeight: '500',
            }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleCourseTypeSelect('')}
            onMouseEnter={(e) => (e.target.style.backgroundColor = '#fff5f5')}
            onMouseLeave={(e) => (e.target.style.backgroundColor = '#ffffff')}
          >
            ✕ Clear selection
          </div>
          {courseTypes.map((courseType) => {
            const count = showCount ? optionCount(courseType) : null;
            return (
              <div
                key={courseType}
                style={{
                  padding: '12px 16px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f8f9fa',
                  transition: 'background-color 0.2s ease',
                  color: selectedCourseType === courseType ? '#1FA8DC' : '#000000',
                  backgroundColor:
                    selectedCourseType === courseType ? '#f0f8ff' : '#ffffff',
                  fontWeight: selectedCourseType === courseType ? '600' : '400',
                }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleCourseTypeSelect(courseType)}
                onMouseEnter={(e) => {
                  if (selectedCourseType !== courseType) {
                    e.currentTarget.style.backgroundColor = '#f8f9fa';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor =
                    selectedCourseType === courseType ? '#f0f8ff' : '#ffffff';
                }}
              >
                <OptionWithCount label={courseType} count={count} showCount={showCount} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
