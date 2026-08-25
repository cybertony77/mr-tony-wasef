import { useEffect, useRef, useState } from 'react';
import {
  CERTIFICATE_FONT_NAMES,
  fontCssFamily,
  ensureCertificateGoogleFontsLoaded,
} from '../lib/certificateFonts';

export default function FontFamilySelect({
  value = '',
  onChange,
  required = false,
  isOpen,
  onToggle,
  onClose,
  label = 'Font Family',
  placeholder = 'Select Google Font',
  error = null,
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const dropdownRef = useRef(null);
  const listRef = useRef(null);
  const selectedOptionRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const wasOpenRef = useRef(false);
  const actualIsOpen = isOpen !== undefined ? isOpen : internalOpen;
  const actualOnToggle = onToggle || (() => setInternalOpen((o) => !o));
  const actualOnClose = onClose || (() => setInternalOpen(false));

  onCloseRef.current = actualOnClose;

  useEffect(() => {
    ensureCertificateGoogleFontsLoaded();
  }, []);

  // Click-outside to close (stable — does not rebind on every parent render)
  useEffect(() => {
    if (!actualIsOpen) return undefined;
    ensureCertificateGoogleFontsLoaded();
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        onCloseRef.current?.();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [actualIsOpen]);

  // Scroll to selected font only once when the menu opens
  useEffect(() => {
    const justOpened = actualIsOpen && !wasOpenRef.current;
    wasOpenRef.current = actualIsOpen;
    if (!justOpened) return undefined;

    const frame = requestAnimationFrame(() => {
      const option = selectedOptionRef.current;
      const list = listRef.current;
      if (!option || !list) return;
      const optionTop = option.offsetTop;
      const optionHeight = option.offsetHeight;
      const listHeight = list.clientHeight;
      list.scrollTop = Math.max(0, optionTop - listHeight / 2 + optionHeight / 2);
    });
    return () => cancelAnimationFrame(frame);
  }, [actualIsOpen]);

  const handleSelect = (font) => {
    onChange(font);
    actualOnClose();
  };

  const valueCss = value ? fontCssFamily(value) : 'inherit';

  return (
    <div style={{ position: 'relative', width: '100%', marginBottom: error ? 4 : 0 }}>
      {label && (
        <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
          {label} {required && <span style={{ color: 'red' }}>*</span>}
        </label>
      )}
      <div ref={dropdownRef} style={{ position: 'relative', width: '100%' }}>
        <div
          style={{
            padding: '14px 16px',
            border: error
              ? '2px solid #f87171'
              : actualIsOpen
                ? '2px solid #1FA8DC'
                : '2px solid #e9ecef',
            borderRadius: 12,
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '1.05rem',
            color: value ? '#1FA8DC' : '#adb5bd',
            backgroundColor: error ? '#fff5f5' : value ? '#f0f8ff' : '#ffffff',
            fontWeight: value ? 600 : 400,
            fontFamily: valueCss,
            transition: 'all 0.3s ease',
            boxShadow: error
              ? '0 0 0 4px rgba(220, 53, 69, 0.12), 0 8px 18px rgba(220, 53, 69, 0.08)'
              : actualIsOpen
                ? '0 0 0 3px rgba(31, 168, 220, 0.1)'
                : 'none',
          }}
          onClick={actualOnToggle}
        >
          <span style={{ fontFamily: valueCss }}>{value || placeholder}</span>
        </div>

        {actualIsOpen && (
          <div
            ref={listRef}
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              backgroundColor: '#ffffff',
              border: '2px solid #e9ecef',
              borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              zIndex: 1200,
              maxHeight: 280,
              overflowY: 'auto',
              marginTop: 4,
            }}
          >
            {CERTIFICATE_FONT_NAMES.map((font) => {
              const css = fontCssFamily(font);
              const isSelected = value === font;
              return (
                <div
                  key={font}
                  ref={isSelected ? selectedOptionRef : null}
                  style={{
                    padding: '12px 16px',
                    cursor: 'pointer',
                    borderBottom: '1px solid #f8f9fa',
                    color: isSelected ? '#1FA8DC' : '#000000',
                    backgroundColor: isSelected ? '#f0f8ff' : '#ffffff',
                    fontWeight: isSelected ? 600 : 400,
                    fontFamily: css,
                    fontSize: '1.15rem',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(font)}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = '#f8f9fa';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = isSelected ? '#f0f8ff' : '#ffffff';
                  }}
                >
                  {font}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {error && (
        <div
          data-cert-error="true"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            marginTop: 8,
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
  );
}
