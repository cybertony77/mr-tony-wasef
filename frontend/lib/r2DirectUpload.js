/**
 * Browser → R2 direct upload (presigned PUT), same pattern as VideoInput.
 * Used for large PDFs that exceed Cloudinary's free-plan 10 MB cap.
 */

import apiClient from './axios';

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

  // Best-effort CORS setup (same as videos)
  try {
    await apiClient.post('/api/upload/r2-setup-cors');
  } catch {
    /* continue — signed-url also ensures CORS */
  }

  const { data } = await apiClient.post('/api/upload/r2-signed-url', {
    fileName: file.name || 'upload.bin',
    contentType: file.type || 'application/octet-stream',
    prefix,
  });

  const { signedUrl, key, contentType: signedContentType, corsSetup } = data || {};
  if (!signedUrl || !key) {
    throw new Error('Failed to get upload URL from server');
  }

  const putContentType = signedContentType || file.type || 'application/octet-stream';

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', signedUrl, true);
    xhr.timeout = 0;
    xhr.setRequestHeader('Content-Type', putContentType);

    if (options.onProgress) {
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable && evt.total > 0) {
          try {
            options.onProgress(Math.min(99, Math.round((evt.loaded / evt.total) * 100)));
          } catch { /* ignore */ }
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
      if (xhr.status >= 200 && xhr.status < 300) {
        if (options.onProgress) {
          try { options.onProgress(100); } catch { /* ignore */ }
        }
        resolve();
      } else {
        reject(new Error(`R2 upload failed (HTTP ${xhr.status})`));
      }
    };
    xhr.onerror = () => {
      const corsDetails = corsSetup?.error;
      reject(
        new Error(
          corsDetails
            ? `Direct upload blocked by R2 CORS: ${corsDetails}`
            : 'Network error while uploading to storage. Check R2 CORS settings.'
        )
      );
    };
    xhr.onabort = () => reject(new DOMException('Upload aborted', 'AbortError'));
    xhr.ontimeout = () => reject(new Error('Upload to storage timed out'));

    xhr.send(file);
  });

  // Same-origin proxy URL for viewing/download (works with PdfViewerModal + auth cookies)
  return {
    key,
    url: `/api/files/${key.split('/').map(encodeURIComponent).join('/')}`,
  };
}
