import { useState, useRef, useEffect } from 'react';

const triggerStyle = (open, hasValue, onDark) => ({
  padding: '14px 16px',
  border: open
    ? '2px solid #1FA8DC'
    : onDark
      ? '2px solid rgba(148, 163, 184, 0.35)'
      : '2px solid #e9ecef',
  borderRadius: '12px',
  backgroundColor: hasValue ? '#f0f8ff' : '#ffffff',
  cursor: 'pointer',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: '1rem',
  color: hasValue ? '#1FA8DC' : '#94a3b8',
  fontWeight: hasValue ? 600 : 400,
  transition: 'all 0.3s ease',
  boxShadow: open
    ? '0 0 0 3px rgba(31, 168, 220, 0.14)'
    : onDark
      ? '0 8px 20px rgba(15, 23, 42, 0.18)'
      : 'none',
  minHeight: 48,
});

const menuStyle = {
  position: 'absolute',
  top: '100%',
  left: 0,
  right: 0,
  backgroundColor: '#ffffff',
  border: '2px solid #e9ecef',
  borderRadius: '10px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
  zIndex: 1000,
  maxHeight: '220px',
  overflowY: 'auto',
  marginTop: '4px',
};

/**
 * Multi-select dropdown styled like CourseSelect / CenterSelect.
 * @param {{ label: string, options: {value:string,label:string}[], value: string[], onChange: (ids:string[])=>void, placeholder?: string }} props
 */
export default function MarketingMultiSelect({
  label,
  options = [],
  value = [],
  onChange,
  placeholder = 'Select…',
  onDark = false,
  showChips = false,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const selected = new Set(value || []);
  const selectedLabels = options
    .filter((o) => selected.has(o.value))
    .map((o) => o.label);

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  };

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      {label ? (
        <label
          style={{
            display: 'block',
            marginBottom: 8,
            fontWeight: 600,
            color: onDark ? '#e2e8f0' : '#495057',
            fontSize: '0.95rem',
            textAlign: 'center',
          }}
        >
          {label}
        </label>
      ) : null}
      <div
        role="button"
        tabIndex={0}
        style={triggerStyle(open, selectedLabels.length > 0, onDark)}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        <span style={{ flex: 1, textAlign: 'left', lineHeight: 1.4 }}>
          {selectedLabels.length > 0 ? selectedLabels.join(', ') : placeholder}
        </span>
      </div>
      {open && (
        <div style={menuStyle}>
          {options.length === 0 ? (
            <div style={{ padding: '12px 16px', color: '#6c757d' }}>No options</div>
          ) : (
            options.map((opt) => {
              const checked = selected.has(opt.value);
              return (
                <div
                  key={opt.value}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggle(opt.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggle(opt.value);
                    }
                  }}
                  style={{
                    padding: '12px 16px',
                    cursor: 'pointer',
                    borderBottom: '1px solid #f8f9fa',
                    color: checked ? '#1FA8DC' : '#000',
                    backgroundColor: checked ? '#f0f8ff' : '#fff',
                    fontWeight: checked ? 600 : 400,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <input type="checkbox" readOnly checked={checked} style={{ pointerEvents: 'none' }} />
                  {opt.label}
                </div>
              );
            })
          )}
        </div>
      )}
      {showChips && selectedLabels.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {options
            .filter((o) => selected.has(o.value))
            .map((o) => (
              <span
                key={o.value}
                style={{
                  fontSize: '0.8rem',
                  padding: '4px 10px',
                  borderRadius: 20,
                  background: '#e8f6fc',
                  color: '#1FA8DC',
                  fontWeight: 600,
                }}
              >
                {o.label}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(o.value);
                  }}
                  style={{
                    marginLeft: 6,
                    border: 'none',
                    background: 'transparent',
                    color: '#dc3545',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                  aria-label={`Remove ${o.label}`}
                >
                  ×
                </button>
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
