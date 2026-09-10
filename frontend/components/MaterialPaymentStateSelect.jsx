import { useState, useRef, useEffect } from 'react';

/**
 * Compact payment-state dropdown for materials (Paid / Free).
 * Same look as AccountStateSelect / CourseSelect — no native arrow.
 */
export default function MaterialPaymentStateSelect({
  value,
  onChange,
  placeholder = 'Select Payment State',
  required = false,
  disabled = false,
  style = {},
  label = 'Material Payment State',
  error = null,
  /** When true, show "Clear selection" (for filters → all payment states). */
  allowClear = false,
  isOpen: controlledIsOpen,
  onToggle,
  onClose,
}) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;

  const options = [
    ...(allowClear
      ? [{ value: '', label: '✕ Clear selection', color: '#dc3545', isClear: true }]
      : []),
    { value: 'free', label: 'Free', color: '#0f172a' },
    { value: 'paid', label: 'Paid', color: '#0f172a' },
  ];

  const selectedOption = options.find((opt) => opt.value === (value || ''));

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        if (controlledIsOpen !== undefined && onClose) onClose();
        else setInternalIsOpen(false);
      }
    };

    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, controlledIsOpen, onClose]);

  const handleSelect = (option) => {
    onChange(option.value === '' ? null : option.value);
    if (controlledIsOpen !== undefined && onClose) onClose();
    else setInternalIsOpen(false);
  };

  const handleToggle = () => {
    if (disabled) return;
    if (controlledIsOpen !== undefined && onToggle) onToggle();
    else setInternalIsOpen((o) => !o);
  };

  const hasValue = Boolean(value);

  return (
    <div className="form-group" style={{ ...style, marginBottom: style.marginBottom ?? '16px', textAlign: 'left' }}>
      {!style.hideLabel && (
        <label
          style={{
            textAlign: 'left',
            display: 'block',
            marginBottom: 8,
            fontWeight: 600,
            color: '#495057',
            fontSize: '0.95rem',
          }}
        >
          {label} {required ? <span style={{ color: 'red' }}>*</span> : null}
        </label>
      )}
      <div ref={dropdownRef} style={{ position: 'relative', width: '100%' }}>
        <div
          onClick={handleToggle}
          style={{
            padding: '14px 16px',
            border: error
              ? '2px solid #dc3545'
              : isOpen
                ? '2px solid #1FA8DC'
                : '2px solid #e9ecef',
            borderRadius: 10,
            backgroundColor: hasValue ? '#f0f8ff' : '#ffffff',
            cursor: disabled ? 'not-allowed' : 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '1rem',
            color: hasValue ? '#1FA8DC' : '#adb5bd',
            fontWeight: hasValue ? 600 : 400,
            transition: 'all 0.3s ease',
            boxShadow: isOpen ? '0 0 0 3px rgba(31, 168, 220, 0.1)' : 'none',
            opacity: disabled ? 0.65 : 1,
          }}
        >
          <span
            style={{
              color: hasValue
                ? selectedOption?.color || '#0f172a'
                : '#adb5bd',
            }}
          >
            {hasValue && selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>

        {isOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              backgroundColor: '#ffffff',
              border: '2px solid #e9ecef',
              borderRadius: 10,
              boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
              zIndex: 1000,
              maxHeight: 200,
              overflowY: 'auto',
              marginTop: 4,
            }}
          >
            {options.map((option) => (
              <div
                key={option.value === '' ? 'clear' : option.value}
                onClick={() => handleSelect(option)}
                style={{
                  padding: '12px 16px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f8f9fa',
                  transition: 'background-color 0.2s ease',
                  color: option.isClear ? '#dc3545' : '#000000',
                  fontWeight: option.isClear ? 500 : 'normal',
                  backgroundColor:
                    !option.isClear && option.value === value ? '#f0f8ff' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f8f9fa';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor =
                    !option.isClear && option.value === value ? '#f0f8ff' : 'transparent';
                }}
              >
                {option.label}
              </div>
            ))}
          </div>
        )}
      </div>
      {error ? (
        <div style={{ color: '#dc3545', fontSize: '0.875rem', marginTop: 4 }}>{error}</div>
      ) : null}
    </div>
  );
}
