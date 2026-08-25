import { formatCodePopupMessage } from '../lib/verificationCodeMessages';

export default function CodePopupMessage({ message }) {
  if (!message) return null;
  return (
    <div role="alert" className="code-popup-msg">
      <span aria-hidden="true" className="code-popup-msg-icon">
        !
      </span>
      <span className="code-popup-msg-text">{formatCodePopupMessage(message)}</span>
    </div>
  );
}
