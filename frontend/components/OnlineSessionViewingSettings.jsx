export const ONLINE_SESSION_PAYMENT_STATES = ['paid', 'free', 'free_if_attended_in_center'];

export const FREE_ONLINE_SESSION_PAYMENT_STATES = ['free', 'free_if_attended_in_center'];

export function needsViewingSettings(paymentState) {
  return FREE_ONLINE_SESSION_PAYMENT_STATES.includes(paymentState);
}

export function formatOnlineSessionPaymentLabel(paymentState) {
  switch (paymentState) {
    case 'paid':
      return 'paid';
    case 'free':
      return 'free';
    case 'free_if_attended_in_center':
      return 'free if attended in center';
    default:
      return paymentState || 'paid';
  }
}

export function validateViewingSettings(paymentState, viewingLimitType, viewingLimitValue) {
  if (!needsViewingSettings(paymentState)) {
    return {};
  }
  const errors = {};
  if (viewingLimitType !== 'number_of_views' && viewingLimitType !== 'number_of_days') {
    errors.viewingLimitType = '❌ Viewing Settings type is required';
  }
  const num = Number(viewingLimitValue);
  if (viewingLimitValue === '' || viewingLimitValue === null || viewingLimitValue === undefined || Number.isNaN(num) || num < 0) {
    errors.viewingLimitValue = '❌ Enter a number (minimum 0)';
  }
  return errors;
}

/**
 * Viewing settings for free / free-if-attended recorded sessions.
 * Two radios (number of views / number of days) + number input when selected.
 */
export default function OnlineSessionViewingSettings({
  viewingLimitType,
  viewingLimitValue,
  onTypeChange,
  onValueChange,
  errors = {},
}) {
  const radioStyle = (selected) => ({
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    padding: '10px',
    borderRadius: '8px',
    border: selected ? '2px solid #1FA8DC' : '2px solid #e9ecef',
    backgroundColor: selected ? '#f0f8ff' : 'white',
    width: '100%',
    boxSizing: 'border-box',
  });

  const numberInputStyle = {
    width: '100%',
    padding: '12px 16px',
    border: errors.viewingLimitValue ? '2px solid #dc3545' : '2px solid #e9ecef',
    borderRadius: '10px',
    fontSize: '1rem',
    boxSizing: 'border-box',
    transition: 'border-color 0.3s ease',
  };

  return (
    <div className="viewing-settings-section" style={{ marginBottom: '20px' }}>
      <label style={{ display: 'block', marginBottom: '12px', fontWeight: '600', textAlign: 'left' }}>
        Viewing Settings <span style={{ color: 'red' }}>*</span>
      </label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <label style={radioStyle(viewingLimitType === 'number_of_views')}>
          <input
            type="radio"
            name="viewing_limit_type"
            value="number_of_views"
            checked={viewingLimitType === 'number_of_views'}
            onChange={() => onTypeChange('number_of_views')}
            style={{ marginRight: '10px', width: '18px', height: '18px', cursor: 'pointer', flexShrink: 0 }}
          />
          <span style={{ fontWeight: '500' }}>Number of views</span>
        </label>
        {viewingLimitType === 'number_of_views' && (
          <div style={{ marginBottom: '4px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', textAlign: 'left' }}>
              Number of Views <span style={{ color: 'red' }}>*</span>
            </label>
            <input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={viewingLimitValue}
              onChange={(e) => onValueChange(e.target.value)}
              placeholder="Enter number of views"
              style={numberInputStyle}
            />
          </div>
        )}
        <label style={radioStyle(viewingLimitType === 'number_of_days')}>
          <input
            type="radio"
            name="viewing_limit_type"
            value="number_of_days"
            checked={viewingLimitType === 'number_of_days'}
            onChange={() => onTypeChange('number_of_days')}
            style={{ marginRight: '10px', width: '18px', height: '18px', cursor: 'pointer', flexShrink: 0 }}
          />
          <span style={{ fontWeight: '500' }}>Number of days</span>
        </label>
        {viewingLimitType === 'number_of_days' && (
          <div style={{ marginBottom: '4px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', textAlign: 'left' }}>
              Number of Days <span style={{ color: 'red' }}>*</span>
            </label>
            <input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={viewingLimitValue}
              onChange={(e) => onValueChange(e.target.value)}
              placeholder="Enter number of days"
              style={numberInputStyle}
            />
          </div>
        )}
      </div>
      {errors.viewingLimitType && (
        <div style={{ color: '#dc3545', fontSize: '0.875rem', marginTop: '4px' }}>
          {errors.viewingLimitType}
        </div>
      )}
      {errors.viewingLimitValue && (
        <div style={{ color: '#dc3545', fontSize: '0.875rem', marginTop: '4px' }}>
          {errors.viewingLimitValue}
        </div>
      )}
    </div>
  );
}
