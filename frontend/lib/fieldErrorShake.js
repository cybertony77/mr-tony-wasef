import { useEffect, useState } from 'react';

/**
 * Same shake as login FloatingLabelInput:
 * fieldShake keyframes, 0.5s, then class removed.
 * Label stays red while `isError` is true.
 */
export function useFieldErrorShake(isError, errorToken = '') {
  const [shaking, setShaking] = useState(false);

  useEffect(() => {
    if (!isError) {
      setShaking(false);
      return undefined;
    }

    // Restart animation even if already shaking (same pattern as FloatingLabelInput)
    setShaking(false);
    const frame = requestAnimationFrame(() => {
      setShaking(true);
    });
    const t = setTimeout(() => setShaking(false), 500);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(t);
    };
  }, [isError, errorToken]);

  return {
    shakeClass: shaking ? 'field-error-shake' : '',
    labelClass: isError ? 'field-error-label' : '',
  };
}

/** Matches styles/FloatingLabelInput.module.css .shake / @keyframes fieldShake */
export const FIELD_ERROR_SHAKE_CSS = `
  @keyframes field-error-shake {
    0%,
    100% {
      transform: translateX(0);
    }
    20% {
      transform: translateX(-6px);
    }
    40% {
      transform: translateX(6px);
    }
    60% {
      transform: translateX(-4px);
    }
    80% {
      transform: translateX(4px);
    }
  }
  .field-error-shake {
    animation: field-error-shake 0.5s ease-in-out;
  }
  .field-error-label {
    color: #dc3545 !important;
  }
`;
