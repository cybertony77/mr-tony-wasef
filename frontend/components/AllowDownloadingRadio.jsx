/**
 * Yes/No radio for PDF allow_downloading (default: true / Yes).
 * Matches homework shuffle radio style; stacks on mobile, side-by-side on wider screens.
 */
export default function AllowDownloadingRadio({
  value = true,
  onChange,
  name = 'allow_downloading',
  error,
  required = true,
}) {
  const isYes = value !== false;
  const isNo = value === false;

  const optionStyle = (selected) => ({
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    padding: '12px 14px',
    borderRadius: '10px',
    border: selected ? '2px solid #1FA8DC' : '2px solid #e9ecef',
    backgroundColor: selected ? '#f0f8ff' : '#fff',
    transition: 'border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease',
    boxShadow: selected ? '0 2px 8px rgba(31, 168, 220, 0.12)' : 'none',
    flex: '1 1 0',
    minWidth: 0,
    margin: 0,
  });

  return (
    <div className="allow-downloading-radio" style={{ marginTop: '16px', marginBottom: '4px' }}>
      <label
        style={{
          display: 'block',
          marginBottom: '12px',
          fontWeight: '600',
          textAlign: 'left',
          color: '#333',
        }}
      >
        Allow Downloading{required ? <span style={{ color: 'red' }}> *</span> : null}
      </label>
      <div className="allow-downloading-options">
        <label style={optionStyle(isYes)}>
          <input
            type="radio"
            name={name}
            value="true"
            checked={isYes}
            onChange={() => onChange(true)}
            style={{ marginRight: '10px', width: '18px', height: '18px', cursor: 'pointer', flexShrink: 0 }}
          />
          <span style={{ fontWeight: '500' }}>Yes</span>
        </label>
        <label style={optionStyle(isNo)}>
          <input
            type="radio"
            name={name}
            value="false"
            checked={isNo}
            onChange={() => onChange(false)}
            style={{ marginRight: '10px', width: '18px', height: '18px', cursor: 'pointer', flexShrink: 0 }}
          />
          <span style={{ fontWeight: '500' }}>No</span>
        </label>
      </div>
      {error ? (
        <div style={{ color: '#dc3545', fontSize: '0.875rem', marginTop: '8px', textAlign: 'left' }}>
          {error}
        </div>
      ) : null}
      <style jsx>{`
        .allow-downloading-options {
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 100%;
        }
        @media (min-width: 480px) {
          .allow-downloading-options {
            flex-direction: row;
            gap: 12px;
          }
        }
      `}</style>
    </div>
  );
}

/** true unless explicitly false (legacy docs without the field stay downloadable) */
export function isDownloadingAllowed(allowDownloading) {
  return allowDownloading !== false && allowDownloading !== 'false';
}
