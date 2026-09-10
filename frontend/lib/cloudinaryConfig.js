// Cached Cloudinary configuration. Reads env.config from disk ONCE per process
// instead of on every request/render (the previous implementations re-opened
// the file on every API call and every signed-URL generation, which made image
// galleries and uploads visibly slow).

import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';

let cachedEnv = null;
let cachedConfig = null;
let configured = false;

function loadEnvFromConfigFile() {
  try {
    const envPath = path.join(process.cwd(), '..', 'env.config');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};

    envContent.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const index = trimmed.indexOf('=');
      if (index === -1) return;
      const key = trimmed.substring(0, index).trim();
      let value = trimmed.substring(index + 1).trim();
      value = value.replace(/^"|"$/g, '');
      envVars[key] = value;
    });

    return envVars;
  } catch {
    return {};
  }
}

export function getEnvConfig() {
  // Always re-read so Cloudinary secret rotation works without restart.
  cachedEnv = loadEnvFromConfigFile();
  return cachedEnv;
}

export function getCloudinaryCredentials() {
  const env = getEnvConfig();
  const next = {
    cloud_name: env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET || process.env.CLOUDINARY_API_SECRET,
  };
  const changed =
    !cachedConfig ||
    cachedConfig.cloud_name !== next.cloud_name ||
    cachedConfig.api_key !== next.api_key ||
    cachedConfig.api_secret !== next.api_secret;
  cachedConfig = next;
  if (changed) {
    configured = false;
  }
  return cachedConfig;
}

export function getCloudinary() {
  if (!configured) {
    cloudinary.config({ ...getCloudinaryCredentials(), secure: true });
    configured = true;
  }
  return cloudinary;
}

export { cloudinary };
