/** @typedef {'vvc' | 'vhc'} VerificationCodeKind */

export const CODE_ERROR = {
  INVALID_LENGTH: 'invalid_length',
  WRONG_CODE: 'wrong_code',
  WRONG_LESSON: 'wrong_lesson',
  DEACTIVATED: 'deactivated',
  DEADLINE_EXPIRED: 'deadline_expired',
  DAYS_EXPIRED: 'days_expired',
  NO_VIEWS_REMAINING: 'no_views_remaining',
  USED_BY_ANOTHER: 'used_by_another',
  FREE_VIEWING_ENDED: 'free_viewing_ended',
  NO_VIDEO_PENDING: 'no_video_pending',
  VERIFY_FAILED: 'verify_failed',
  INTERNAL_ERROR: 'internal_error',
  NOT_FOUND: 'not_found',
  SESSION_ID_REQUIRED: 'session_id_required',
  DECREMENT_FAILED: 'decrement_failed',
};

const LABEL = {
  vvc: 'VVC',
  vhc: 'VHC',
};

const MESSAGES = {
  vvc: {
    [CODE_ERROR.INVALID_LENGTH]:
      'Please enter a valid 9-character VVC code.',
    [CODE_ERROR.WRONG_CODE]:
      'This VVC code is incorrect. Double-check the code and try again.',
    [CODE_ERROR.WRONG_LESSON]:
      'This VVC code is not valid for this lesson. Make sure you are using the code for the correct session.',
    [CODE_ERROR.DEACTIVATED]:
      'This VVC code has been deactivated and can no longer be used. Contact your assistant for a new code.',
    [CODE_ERROR.DEADLINE_EXPIRED]:
      'This VVC code has passed its deadline date and is no longer active. Please request a new code.',
    [CODE_ERROR.DAYS_EXPIRED]:
      'Your allowed viewing days for this VVC code have ended. Enter a new VVC code to watch again.',
    [CODE_ERROR.NO_VIEWS_REMAINING]:
      'This VVC code has no views left. Each view counts when you start watching the video.',
    [CODE_ERROR.USED_BY_ANOTHER]:
      'This VVC code was already redeemed by another student and cannot be used on your account.',
    [CODE_ERROR.FREE_VIEWING_ENDED]:
      'Your free viewing for this session has ended. Enter a valid VVC code to continue watching.',
    [CODE_ERROR.NO_VIDEO_PENDING]:
      'Select a recorded session first, then enter your VVC code.',
    [CODE_ERROR.VERIFY_FAILED]:
      'We could not verify this VVC code. Please check your connection and try again.',
    [CODE_ERROR.INTERNAL_ERROR]:
      'Something went wrong while checking the VVC code. Please try again in a moment.',
    [CODE_ERROR.NOT_FOUND]:
      'This VVC code could not be found. Please check the code and try again.',
    [CODE_ERROR.SESSION_ID_REQUIRED]:
      'Session information is missing. Refresh the page and try again.',
    [CODE_ERROR.DECREMENT_FAILED]:
      'Could not update your remaining VVC views. Please refresh and try again.',
  },
  vhc: {
    [CODE_ERROR.INVALID_LENGTH]:
      'Please enter a valid 9-character VHC code.',
    [CODE_ERROR.WRONG_CODE]:
      'This VHC code is incorrect. Double-check the code and try again.',
    [CODE_ERROR.WRONG_LESSON]:
      'This VHC code is not valid for this homework video. Make sure you are using the code for the correct lesson.',
    [CODE_ERROR.DEACTIVATED]:
      'This VHC code has been deactivated and can no longer be used. Contact your assistant for a new code.',
    [CODE_ERROR.DEADLINE_EXPIRED]:
      'This VHC code has passed its deadline date and is no longer active. Please request a new code.',
    [CODE_ERROR.DAYS_EXPIRED]:
      'Your allowed viewing days for this VHC code have ended. Enter a new VHC code to watch again.',
    [CODE_ERROR.NO_VIEWS_REMAINING]:
      'This VHC code has no views left. Each view counts when you start watching the homework video.',
    [CODE_ERROR.USED_BY_ANOTHER]:
      'This VHC code was already redeemed by another student and cannot be used on your account.',
    [CODE_ERROR.FREE_VIEWING_ENDED]:
      'Free access for this homework video has ended. Enter a valid VHC code to continue watching.',
    [CODE_ERROR.NO_VIDEO_PENDING]:
      'Select a homework video first, then enter your VHC code.',
    [CODE_ERROR.VERIFY_FAILED]:
      'We could not verify this VHC code. Please check your connection and try again.',
    [CODE_ERROR.INTERNAL_ERROR]:
      'Something went wrong while checking the VHC code. Please try again in a moment.',
    [CODE_ERROR.NOT_FOUND]:
      'This VHC code could not be found. Please check the code and try again.',
    [CODE_ERROR.SESSION_ID_REQUIRED]:
      'Video information is missing. Refresh the page and try again.',
    [CODE_ERROR.DECREMENT_FAILED]:
      'Could not update your remaining VHC views. Please refresh and try again.',
  },
};

/**
 * @param {VerificationCodeKind} kind
 * @param {string} errorCode
 * @param {{ code_settings?: string, deadline_date?: string }} [extras]
 */
export function getVerificationCodeMessage(kind, errorCode, extras = {}) {
  const code = String(errorCode || '').trim();
  const table = MESSAGES[kind] || MESSAGES.vvc;
  if (table[code]) return table[code];

  if (code === CODE_ERROR.DEADLINE_EXPIRED && extras.deadline_date) {
    const label = LABEL[kind] || 'Code';
    return `${label} access ended on ${extras.deadline_date}. Please request a new code.`;
  }

  const label = LABEL[kind] || 'Code';
  return `This ${label} code could not be used. Please check the code and try again.`;
}

/**
 * Build API error payload with stable error_code for the client popup.
 * @param {VerificationCodeKind} kind
 * @param {string} errorCode
 * @param {{ code_settings?: string, deadline_date?: string, status?: number }} [options]
 */
export function codeErrorPayload(kind, errorCode, options = {}) {
  const message = getVerificationCodeMessage(kind, errorCode, options);
  return {
    success: false,
    valid: false,
    error_code: errorCode,
    code_settings: options.code_settings || undefined,
    deadline_date: options.deadline_date || undefined,
    error: message,
  };
}

function normalizeLegacyError(error) {
  return String(error || '')
    .replace(/^❌\s*/i, '')
    .trim()
    .toLowerCase();
}

/**
 * Map legacy API error strings to error_code (backward compatibility).
 * @param {string} error
 * @param {string} [codeSettings]
 */
export function inferErrorCodeFromLegacyError(error, codeSettings) {
  const text = normalizeLegacyError(error);
  if (!text) return null;

  if (text.includes('9 character') || text.includes('must be 9')) {
    return CODE_ERROR.INVALID_LENGTH;
  }
  if (text.includes('deactivated')) return CODE_ERROR.DEACTIVATED;
  if (text.includes('no views remaining') || text.includes('views remaining')) {
    return CODE_ERROR.NO_VIEWS_REMAINING;
  }
  if (text.includes('already used by another')) return CODE_ERROR.USED_BY_ANOTHER;
  if (text.includes('free viewing ended')) return CODE_ERROR.FREE_VIEWING_ENDED;
  if (text.includes('no video pending')) return CODE_ERROR.NO_VIDEO_PENDING;
  if (text.includes('failed to verify') || text.includes('failed to decrement')) {
    return CODE_ERROR.VERIFY_FAILED;
  }
  if (text.includes('internal server') || text.includes('something went wrong')) {
    return CODE_ERROR.INTERNAL_ERROR;
  }
  if (text.includes('not found') && text.includes('record')) return CODE_ERROR.NOT_FOUND;
  if (text.includes('wrong vvc') || text.includes('wrong vhc') || text.includes('recheck')) {
    return CODE_ERROR.WRONG_CODE;
  }
  if (text.includes('expired') || text.includes('is expired')) {
    if (codeSettings === 'number_of_days') return CODE_ERROR.DAYS_EXPIRED;
    if (codeSettings === 'deadline_date') return CODE_ERROR.DEADLINE_EXPIRED;
    return CODE_ERROR.DAYS_EXPIRED;
  }
  if (text.includes('invalid vvc') || text.includes('invalid vhc')) {
    return CODE_ERROR.WRONG_CODE;
  }

  return null;
}

/**
 * Resolve popup text from API body or explicit error code.
 * @param {VerificationCodeKind} kind
 * @param {{ error_code?: string, error?: string, code_settings?: string, deadline_date?: string } | string | null | undefined} source
 */
export function resolveVerificationCodeError(kind, source) {
  if (typeof source === 'string') {
    if (MESSAGES[kind]?.[source]) {
      return getVerificationCodeMessage(kind, source);
    }
    const code = inferErrorCodeFromLegacyError(source);
    return code
      ? getVerificationCodeMessage(kind, code)
      : source.replace(/^❌\s*/, '').trim();
  }

  const data = source || {};
  const errorCode =
    data.error_code ||
    inferErrorCodeFromLegacyError(data.error, data.code_settings);

  if (errorCode) {
    return getVerificationCodeMessage(kind, errorCode, {
      code_settings: data.code_settings,
      deadline_date: data.deadline_date,
    });
  }

  if (data.error) {
    return String(data.error).replace(/^❌\s*/, '').trim();
  }

  return getVerificationCodeMessage(kind, CODE_ERROR.VERIFY_FAILED);
}

export function formatCodePopupMessage(msg) {
  if (!msg) return '';
  return String(msg).replace(/^❌\s*/, '').trim();
}
