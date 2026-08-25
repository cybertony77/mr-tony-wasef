import { useState, useRef, useEffect } from 'react';

const FromPublicSelect = ({
  value,
  onChange,
  placeholder = 'Select From Public Page',
  required = false,
  disabled = false,
  style = {},
  label = 'From Public Page',
  error = null,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const options = [
    { value: '', label: '✕ Clear selection', color: '#dc3545', isClear: true },
    { value: true, label: 'Yes', color: '#6f42c1' },
    { value: false, label: 'No', color: '#0B8EC4' },
  ];

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (option) => {
    onChange(option.value === '' ? null : option.value);
    setIsOpen(false);
  };

  return (
    <div className="form-group" style={{ ...style, marginBottom: style.marginBottom ?? 16, textAlign: 'left' }}>
      {!style.hideLabel && (
        <label style={{ textAlign: 'left', display: 'block', marginBottom: 8, fontWeight: 600, color: '#495057', fontSize: '0.95rem' }}>
          {label} {required && <span style={{ color: 'red' }}>*</span>}
        </label>
      )}
      <div ref={dropdownRef} style={{ position: 'relative', width: '100%' }}>
        <div
          onClick={() => !disabled && setIsOpen(!isOpen)}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
          style={{
            padding: '14px 16px',
            border: error
              ? '2px solid #dc3545'
              : isOpen
                ? '2px solid #1FA8DC'
                : '2px solid #e9ecef',
            borderRadius: '10px',
            backgroundColor: selectedOption && !selectedOption.isClear ? '#f0f8ff' : '#ffffff',
            cursor: disabled ? 'not-allowed' : 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '1rem',
            color: selectedOption ? '#1FA8DC' : '#adb5bd',
            fontWeight: selectedOption && !selectedOption.isClear ? '600' : '400',
            transition: 'all 0.3s ease',
            boxShadow: isOpen ? '0 0 0 3px rgba(31, 168, 220, 0.1)' : 'none',
          }}
        >
          <span style={{ color: selectedOption ? selectedOption.color : '#adb5bd' }}>
            {selectedOption && !selectedOption.isClear ? selectedOption.label : placeholder}
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
              borderRadius: '10px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
              zIndex: 1000,
              maxHeight: '200px',
              overflowY: 'auto',
              marginTop: '4px',
            }}
          >
            {options.map((option) => (
              <div
                key={option.value === '' ? 'clear' : String(option.value)}
                style={{
                  padding: '12px 16px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f8f9fa',
                  transition: 'background-color 0.2s ease',
                  color: option.isClear ? '#dc3545' : '#000000',
                  fontWeight: option.isClear ? '500' : 'normal',
                }}
                onClick={() => handleSelect(option)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = option.isClear ? '#fff5f5' : '#f8f9fa';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#ffffff';
                }}
              >
                {option.label}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FromPublicSelect;
