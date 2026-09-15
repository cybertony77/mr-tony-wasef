import apiClient from './axios';

/** Max PDF size when uploading via Cloudinary (SYSTEM_CLOUDFLARE_R2=false). */
export const CLOUDINARY_PDF_MAX_BYTES = 10 * 1024 * 1024;

const R2_MAX_BYTES = 200 * 1024 * 1024;

let cachedCloudflareR2 = null;

export async function isCloudflareR2Enabled() {
  if (cachedCloudflareR2 !== null) return cachedCloudflareR2;
  try {
    const res = await apiClient.get('/api/system/config');
    cachedCloudflareR2 = res.data?.cloudflare_r2 === true;
  } catch {
    cachedCloudflareR2 = false;
  }
  return cachedCloudflareR2;
}

/**
 * Upload a PDF to R2 (when cloudflare_r2) or Cloudinary (otherwise, 10 MB max).
 *
 * @param {File} file
 * @param {{ prefix: string, cloudinaryFolder: string, onProgress?: (n:number)=>void, signal?: AbortSignal, cloudflareR2?: boolean }} options
 * @returns {Promise<{ url: string, key?: string }>}
 */
export async function uploadPdf(file, options) {
  const {
    prefix,
    cloudinaryFolder,
    onProgress,
    signal,
    cloudflareR2: cloudflareR2Override,
  } = options;

  const useR2 =
    typeof cloudflareR2Override === 'boolean'
      ? cloudflareR2Override
      : await isCloudflareR2Enabled();

  if (useR2) {
    const maxR2 = options.maxR2Bytes ?? R2_MAX_BYTES;
    if (file.size > maxR2) {
      const maxMb = Math.round(maxR2 / (1024 * 1024));
      throw new Error(`File size exceeds ${maxMb}MB limit`);
    }
    const { uploadToR2Direct } = await import('./r2DirectUpload');
    return uploadToR2Direct(file, { prefix, onProgress, signal });
  }

  if (file.size > CLOUDINARY_PDF_MAX_BYTES) {
    throw new Error('File size exceeds 10MB limit (Cloudinary upload mode)');
  }

  const { uploadToCloudinaryDirect } = await import('./cloudinaryDirectUpload');
  const result = await uploadToCloudinaryDirect(file, {
    folder: cloudinaryFolder,
    onProgress,
    signal,
  });
  return {
    url: result.secure_url,
    key: result.public_id,
  };
}
