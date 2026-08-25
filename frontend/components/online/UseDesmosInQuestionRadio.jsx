import { useSystemConfig } from '../../lib/api/system';

function isFeatureEnabled(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

/**
 * Yes/No radio: "Use Desmos in this question" (default: No).
 * Hidden when SYSTEM_DESMOS_INTEGRATIONS is not enabled.
 * Matches AllowDownloadingRadio card style; stacks on mobile.
 */
export default function UseDesmosInQuestionRadio({
  value = false,
  onChange,
  name = 'use_desmos',
}) {
  const { data: systemConfig } = useSystemConfig();
  const show = isFeatureEnabled(systemConfig?.desmos_integrations);

  if (!show) return null;

  const isYes = value === true || value === 'true';
  const isNo = !isYes;

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
    <div className="use-desmos-radio" style={{ marginBottom: '16px' }}>
      <label
        style={{
          display: 'block',
          marginBottom: '12px',
          fontWeight: '600',
          textAlign: 'left',
          color: '#333',
        }}
      >
        Use Desmos in this question
      </label>
      <div className="use-desmos-options">
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
      <style jsx>{`
        .use-desmos-options {
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 100%;
        }
        @media (min-width: 480px) {
          .use-desmos-options {
            flex-direction: row;
            gap: 12px;
          }
        }
      `}</style>
    </div>
  );
}

/** true only when explicitly enabled */
export function isDesmosEnabledForQuestion(useDesmos) {
  return useDesmos === true || useDesmos === 'true';
}
