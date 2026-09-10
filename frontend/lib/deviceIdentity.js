/**
 * Persistent device identity for device-limitation checks.
 *
 * Layers (recover in order, then sync all):
 * 1. IndexedDB
 * 2. localStorage
 * 3. First-party cookie
 * 4. Generate cryptographically random UUID
 *
 * Also builds a secondary browser fingerprint string (hashed server-side).
 */

const STORAGE_KEY = 'demo_device_id';
const IDB_NAME = 'demo_device_identity';
const IDB_STORE = 'identity';
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 400; // ~400 days

function canUseWindow() {
  return typeof window !== 'undefined';
}

function generateUuid() {
  try {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  try {
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  } catch {
    /* fall through */
  }
  return `dev-${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

function isValidDeviceId(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'unknown-device') return false;
  return trimmed.length >= 8 && trimmed.length <= 128;
}

function readCookie(name) {
  if (!canUseWindow() || !document.cookie) return null;
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const [rawKey, ...rest] = part.split('=');
    if (rawKey && rawKey.trim() === name) {
      try {
        return decodeURIComponent(rest.join('=').trim());
      } catch {
        return rest.join('=').trim();
      }
    }
  }
  return null;
}

function writeCookie(name, value) {
  if (!canUseWindow()) return;
  try {
    const secure =
      typeof window.location !== 'undefined' && window.location.protocol === 'https:'
        ? '; Secure'
        : '';
    document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${COOKIE_MAX_AGE_SEC}; SameSite=Lax${secure}`;
  } catch {
    /* ignore */
  }
}

function readLocalStorage() {
  if (!canUseWindow()) return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeLocalStorage(value) {
  if (!canUseWindow()) return;
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}

function openIdb() {
  return new Promise((resolve, reject) => {
    if (!canUseWindow() || !window.indexedDB) {
      reject(new Error('indexedDB unavailable'));
      return;
    }
    const request = window.indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('indexedDB open failed'));
  });
}

async function readIndexedDb() {
  try {
    const db = await openIdb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(STORAGE_KEY);
      req.onsuccess = () => {
        db.close();
        resolve(typeof req.result === 'string' ? req.result : null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error || new Error('indexedDB read failed'));
      };
    });
  } catch {
    return null;
  }
}

async function writeIndexedDb(value) {
  try {
    const db = await openIdb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(value, STORAGE_KEY);
      req.onsuccess = () => {
        db.close();
        resolve();
      };
      req.onerror = () => {
        db.close();
        reject(req.error || new Error('indexedDB write failed'));
      };
    });
  } catch {
    /* ignore */
  }
}

async function syncDeviceIdEverywhere(deviceId) {
  if (!isValidDeviceId(deviceId)) return;
  writeLocalStorage(deviceId);
  writeCookie(STORAGE_KEY, deviceId);
  await writeIndexedDb(deviceId);
}

/**
 * Stable-ish secondary fingerprint components (NOT a sole auth factor).
 * Server hashes this string with SHA-256 before storage.
 */
export function buildDeviceFingerprintComponents() {
  if (!canUseWindow()) {
    return '';
  }

  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const screenObj = typeof window.screen !== 'undefined' ? window.screen : {};
  let timezone = '';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    timezone = '';
  }

  const languages = Array.isArray(nav.languages) ? nav.languages.join(',') : '';

  const parts = [
    `ua:${nav.userAgent || ''}`,
    `platform:${nav.platform || ''}`,
    `lang:${nav.language || ''}`,
    `langs:${languages}`,
    `tz:${timezone}`,
    `tzOff:${new Date().getTimezoneOffset()}`,
    `hw:${nav.hardwareConcurrency || ''}`,
    `mem:${nav.deviceMemory || ''}`,
    `touch:${nav.maxTouchPoints || 0}`,
    `sw:${screenObj.width || ''}`,
    `sh:${screenObj.height || ''}`,
    `sd:${screenObj.colorDepth || ''}`,
    `pd:${screenObj.pixelDepth || ''}`,
    `dpr:${typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : ''}`,
    `cookie:${nav.cookieEnabled ? 1 : 0}`,
    `vendor:${nav.vendor || ''}`,
    `pdf:${nav.pdfViewerEnabled ? 1 : 0}`,
    `ontouch:${'ontouchstart' in window ? 1 : 0}`,
  ];

  return parts.join('|');
}

/**
 * Recover or create a persistent device identity and sync storage layers.
 * @returns {Promise<{ device_id: string, fingerprint: string }>}
 */
export async function getDeviceIdentity() {
  if (!canUseWindow()) {
    return { device_id: '', fingerprint: '' };
  }

  const candidates = [];
  const fromIdb = await readIndexedDb();
  const fromLs = readLocalStorage();
  const fromCookie = readCookie(STORAGE_KEY);
  if (isValidDeviceId(fromIdb)) candidates.push(fromIdb.trim());
  if (isValidDeviceId(fromLs)) candidates.push(fromLs.trim());
  if (isValidDeviceId(fromCookie)) candidates.push(fromCookie.trim());

  // Prefer IndexedDB → localStorage → cookie (first valid in that order already pushed)
  let deviceId = candidates[0] || generateUuid();
  if (!isValidDeviceId(deviceId)) {
    deviceId = generateUuid();
  }

  await syncDeviceIdEverywhere(deviceId);

  const fingerprint = buildDeviceFingerprintComponents();
  return { device_id: deviceId, fingerprint };
}

/**
 * Ensure persistence after successful non-developer login (all layers).
 */
export async function persistDeviceIdentity(deviceId) {
  if (!isValidDeviceId(deviceId)) return;
  await syncDeviceIdEverywhere(deviceId.trim());
}
