// Client-side helper: upload a File directly to Cloudinary with a signed
// signature obtained from `/api/upload/sign`.
//
// Uses chunked upload for large files (required by Cloudinary above ~100 MB)
// so material PDFs (up to 200 MB) and homework/quiz/mock PDFs (up to 100 MB)
// can upload without going through Next.js as base64 JSON (which fails on
// body size / timeouts / CORS-proxy limits).

import apiClient from './axios';

/** Cloudinary recommends 6–20 MB chunks for large uploads. */
const CHUNK_SIZE = 6 * 1024 * 1024;
/** Files at or above this size are uploaded in chunks. */
const CHUNK_THRESHOLD = 20 * 1024 * 1024;
/** Allow slow networks enough time for large PDFs. */
const UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * @typedef {Object} DirectUploadOptions
 * @property {('profile-pictures'|'homeworks-questions-images'|'quizzes-questions-images'|'mock-exams-questions-images'|'HW-PDFs'|'Quizs-PDFs'|'MockExams-PDFs'|'material')} folder
 * @property {(percent:number) => void} [onProgress]    0-100
 * @property {AbortSignal} [signal]                     cancel mid-upload
 */

/**
 * @typedef {Object} DirectUploadResult
 * @property {string} public_id
 * @property {string} secure_url
 * @property {'image'|'raw'|'video'} resource_type
 * @property {'private'|'upload'} type
 * @property {number} bytes
 * @property {string} [format]
 */

function makeUniqueUploadId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseCloudinaryError(xhr) {
  let message = `Cloudinary upload failed (HTTP ${xhr.status})`;
  try {
    const json = JSON.parse(xhr.responseText);
    if (json?.error?.message) message = json.error.message;
  } catch { /* ignore */ }
  return message;
}

/**
 * POST one multipart request (full file or a single chunk) to Cloudinary.
 *
 * @returns {Promise<DirectUploadResult|null>} final result, or null while more chunks remain
 */
function postChunk({ uploadUrl, form, contentRange, uniqueUploadId, signal, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl, true);
    xhr.timeout = timeoutMs;

    if (uniqueUploadId) {
      xhr.setRequestHeader('X-Unique-Upload-Id', uniqueUploadId);
    }
    if (contentRange) {
      xhr.setRequestHeader('Content-Range', contentRange);
    }

    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return reject(new DOMException('Upload aborted', 'AbortError'));
      }
      const onAbort = () => xhr.abort();
      signal.addEventListener('abort', onAbort, { once: true });
      xhr.addEventListener('loadend', () => signal.removeEventListener('abort', onAbort), { once: true });
    }

    xhr.onload = () => {
      // 206 = chunk accepted, more expected; 200 = complete
      if (xhr.status === 206) {
        resolve(null);
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText);
          resolve({
            public_id: json.public_id,
            secure_url: json.secure_url,
            resource_type: json.resource_type,
            type: json.type,
            bytes: json.bytes,
            format: json.format,
          });
        } catch {
          reject(new Error('Cloudinary returned invalid JSON'));
        }
        return;
      }
      reject(new Error(parseCloudinaryError(xhr)));
    };
    xhr.onerror = () => reject(new Error('Network error while uploading to Cloudinary. Check your connection or CORS settings.'));
    xhr.onabort = () => reject(new DOMException('Upload aborted', 'AbortError'));
    xhr.ontimeout = () => reject(new Error('Upload to Cloudinary timed out'));

    xhr.send(form);
  });
}

function buildSignedForm(fileOrBlob, sig, fileName) {
  const form = new FormData();
  form.append('file', fileOrBlob, fileName || 'upload.bin');
  form.append('api_key', sig.api_key);
  form.append('timestamp', String(sig.timestamp));
  form.append('signature', sig.signature);
  form.append('folder', sig.folder);
  form.append('type', sig.type);
  return form;
}

/**
 * Upload a single File to Cloudinary, server-signed.
 * Automatically uses chunked upload for large files.
 *
 * @param {File|Blob} file
 * @param {DirectUploadOptions} options
 * @returns {Promise<DirectUploadResult>}
 */
export async function uploadToCloudinaryDirect(file, options) {
  if (!file) throw new Error('No file provided');
  if (!options?.folder) throw new Error('folder is required');

  const { data: sig } = await apiClient.post('/api/upload/sign', { folder: options.folder });

  if (!sig?.upload_url || !sig?.signature) {
    throw new Error('Invalid sign response from server');
  }

  const total = file.size;
  const fileName = file.name || 'upload.bin';
  const report = (loaded) => {
    if (!options.onProgress || !total) return;
    try {
      options.onProgress(Math.min(100, Math.round((loaded / total) * 100)));
    } catch { /* swallow */ }
  };

  // Small files: single multipart POST (with progress events).
  if (total < CHUNK_THRESHOLD) {
    return await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', sig.upload_url, true);
      xhr.timeout = UPLOAD_TIMEOUT_MS;

      if (options.onProgress) {
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) report(evt.loaded);
        };
      }

      if (options.signal) {
        if (options.signal.aborted) {
          xhr.abort();
          return reject(new DOMException('Upload aborted', 'AbortError'));
        }
        options.signal.addEventListener('abort', () => xhr.abort(), { once: true });
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const json = JSON.parse(xhr.responseText);
            report(total);
            resolve({
              public_id: json.public_id,
              secure_url: json.secure_url,
              resource_type: json.resource_type,
              type: json.type,
              bytes: json.bytes,
              format: json.format,
            });
          } catch {
            reject(new Error('Cloudinary returned invalid JSON'));
          }
        } else {
          reject(new Error(parseCloudinaryError(xhr)));
        }
      };
      xhr.onerror = () => reject(new Error('Network error while uploading to Cloudinary. Check your connection or CORS settings.'));
      xhr.onabort = () => reject(new DOMException('Upload aborted', 'AbortError'));
      xhr.ontimeout = () => reject(new Error('Upload to Cloudinary timed out'));

      xhr.send(buildSignedForm(file, sig, fileName));
    });
  }

  // Large files: chunked upload (required by Cloudinary for 100MB+).
  const uniqueUploadId = makeUniqueUploadId();
  let offset = 0;
  let result = null;

  while (offset < total) {
    if (options.signal?.aborted) {
      throw new DOMException('Upload aborted', 'AbortError');
    }

    const end = Math.min(offset + CHUNK_SIZE, total);
    const chunk = file.slice(offset, end);
    const contentRange = `bytes ${offset}-${end - 1}/${total}`;
    const form = buildSignedForm(chunk, sig, fileName);

    result = await postChunk({
      uploadUrl: sig.upload_url,
      form,
      contentRange,
      uniqueUploadId,
      signal: options.signal,
      timeoutMs: UPLOAD_TIMEOUT_MS,
    });

    offset = end;
    report(offset);
  }

  if (!result?.secure_url && !result?.public_id) {
    throw new Error('Cloudinary chunked upload finished without a result');
  }

  report(total);
  return result;
}
