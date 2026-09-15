/**
 * Short-lived in-memory credentials for first-login / WA flows.
 * Survives client-side router.push within the same tab JS context.
 * Never written to sessionStorage/localStorage.
 *
 * consume*() deletes immediately after read.
 */

const store = {
  studentLogin: null,
  forgotLogin: null,
  assistantWa: null,
};

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

function put(slot, data, ttlMs = DEFAULT_TTL_MS) {
  store[slot] = {
    ...data,
    expiresAt: Date.now() + ttlMs,
  };
}

function consume(slot) {
  const entry = store[slot];
  store[slot] = null;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) return null;
  const { expiresAt, ...data } = entry;
  return data;
}

function peek(slot) {
  const entry = store[slot];
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store[slot] = null;
    return null;
  }
  const { expiresAt, ...data } = entry;
  return data;
}

function clear(slot) {
  store[slot] = null;
}

/** After signup — autofill login once. */
export function setPendingStudentLogin(id, password) {
  put('studentLogin', {
    id: id == null ? '' : String(id),
    password: password == null ? '' : String(password),
  });
}

export function consumePendingStudentLogin() {
  return consume('studentLogin');
}

/** After forgot-password — autofill login once. */
export function setPendingForgotLogin(username, password) {
  put('forgotLogin', {
    username: username == null ? '' : String(username),
    password: password == null ? '' : String(password),
  });
}

export function consumePendingForgotLogin() {
  return consume('forgotLogin');
}

export function updatePendingForgotPassword(password) {
  const cur = peek('forgotLogin') || { username: '' };
  put('forgotLogin', {
    username: cur.username || '',
    password: password == null ? '' : String(password),
  });
}

export function setPendingForgotUsername(username) {
  const cur = peek('forgotLogin') || { password: '' };
  put('forgotLogin', {
    username: username == null ? '' : String(username),
    password: cur.password || '',
  });
}

/** Add-assistant WA message — keep until leave page / reset. */
export function setAssistantWaCredentials(credentials) {
  put('assistantWa', credentials || {}, 60 * 60 * 1000);
}

export function getAssistantWaCredentials() {
  return peek('assistantWa');
}

export function clearAssistantWaCredentials() {
  clear('assistantWa');
}

export function clearAllEphemeralCredentials() {
  store.studentLogin = null;
  store.forgotLogin = null;
  store.assistantWa = null;
}
