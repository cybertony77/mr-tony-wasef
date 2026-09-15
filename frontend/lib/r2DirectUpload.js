/**
 * Browser → same-origin proxy → R2 (no presigned URLs in the network tab).
 */

const ALLOWED_PREFIXES = new Set([
  'pdfs/material',
  'pdfs/HW-PDFs',
  'pdfs/Quizs-PDFs',
  'pdfs/MockExams-PDFs',
  'videos',
]);

/**
 * @param {File|Blob} file
 * @param {{ prefix: string, onProgress?: (percent:number)=>void, signal?: AbortSignal }} options
 * @returns {Promise<{ key: string, url: string }>}
 */
export async function uploadToR2Direct(file, options) {
  if (!file) throw new Error('No file provided');
  const prefix = String(options?.prefix || '').trim();
  if (!ALLOWED_PREFIXES.has(prefix)) {
    throw new Error('Invalid upload prefix');
  }

  const form = new FormData();
  form.append('file', file, file.name || 'upload.bin');
  form.append('prefix', prefix);
  form.append('fileName', file.name || 'upload.bin');

  const key = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload/r2-proxy-upload', true);
    xhr.withCredentials = true;
    xhr.timeout = 0;

    if (options.onProgress) {
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable && evt.total > 0) {
          try {
            options.onProgress(Math.min(99, Math.round((evt.loaded / evt.total) * 100)));
          } catch {
            /* ignore */
          }
        }
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
      let payload = null;
      try {
        payload = JSON.parse(xhr.responseText || '{}');
      } catch {
        payload = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && payload?.key) {
        if (options.onProgress) {
          try {
            options.onProgress(100);
          } catch {
            /* ignore */
          }
        }
        resolve(payload.key);
      } else {
        reject(new Error(payload?.error || `Upload failed (HTTP ${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error while uploading'));
    xhr.onabort = () => reject(new DOMException('Upload aborted', 'AbortError'));
    xhr.ontimeout = () => reject(new Error('Upload timed out'));

    xhr.send(form);
  });

  return {
    key,
    url: `/api/files/${key.split('/').map(encodeURIComponent).join('/')}`,
  };
}
