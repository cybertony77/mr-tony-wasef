import fs from 'fs';
import path from 'path';
import { PutBucketCorsCommand, S3Client } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@aws-sdk/node-http-handler';
import http from 'http';
import https from 'https';

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30_000,
  maxSockets: 50,
  maxFreeSockets: 10,
  // No idle socket timeout — long video proxy streams must not be killed.
  scheduling: 'lifo',
});

const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30_000,
  maxSockets: 50,
  maxFreeSockets: 10,
  scheduling: 'lifo',
});

function createR2RequestHandler() {
  return new NodeHttpHandler({
    httpAgent,
    httpsAgent,
    // Connect/startup only. requestTimeout must stay disabled for multi-hour GetObject bodies.
    connectionTimeout: 15_000,
    requestTimeout: 0,
  });
}

/**
 * Loads env.config from repo root (one level above frontend cwd in dev/build).
 */
export function loadEnvConfig() {
  try {
    const envPath = path.join(process.cwd(), '..', 'env.config');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};

    envContent.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const index = trimmed.indexOf('=');
        if (index !== -1) {
          const key = trimmed.substring(0, index).trim();
          let value = trimmed.substring(index + 1).trim();
          value = value.replace(/^"|"$/g, '');
          envVars[key] = value;
        }
      }
    });

    return envVars;
  } catch {
    return {};
  }
}

export function getR2Config() {
  const envConfig = loadEnvConfig();
  return {
    envConfig,
    accountId: envConfig.CLOUDFLARE_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID,
    accessKeyId: envConfig.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: envConfig.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY,
    bucketName: envConfig.R2_BUCKET_NAME || process.env.R2_BUCKET_NAME,
  };
}

export function assertR2Config(cfg) {
  if (!cfg.accountId || !cfg.accessKeyId || !cfg.secretAccessKey || !cfg.bucketName) {
    const err = new Error('R2 configuration is missing');
    err.statusCode = 500;
    throw err;
  }
}

/** Origins allowed to PUT/GET from the browser to R2 (cross-origin). */
export function buildR2CorsAllowedOrigins(envConfig = {}, requestOrigin = '') {
  const fromEnv =
    process.env.R2_CORS_ORIGINS ||
    envConfig.R2_CORS_ORIGINS ||
    '';
  const extra = fromEnv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const systemDomain = envConfig.SYSTEM_DOMAIN || process.env.SYSTEM_DOMAIN || '';
  const domain = systemDomain ? systemDomain.replace(/\/+$/, '') : '';

  const defaults = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://192.168.1.8:3000',
    'http://192.168.1.8:3001',
  ];

  const origin =
    typeof requestOrigin === 'string' && /^https?:\/\//i.test(requestOrigin.trim())
      ? requestOrigin.trim().replace(/\/+$/, '')
      : '';

  return [...new Set([...defaults, ...extra, ...(domain ? [domain] : []), ...(origin ? [origin] : [])])];
}

function createR2S3ClientPlain(cfg) {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    forcePathStyle: true,
    requestHandler: createR2RequestHandler(),
  });
}

/**
 * Ensures bucket CORS allows browser → R2 PUT (and preflight OPTIONS).
 * Re-applies when the request origin is not yet in the allow-list.
 * If this fails (IAM), run POST /api/upload/r2-setup-cors or set CORS in Cloudflare dashboard.
 */
export async function ensureR2CorsForBrowserUploads(cfg, requestOrigin = '') {
  const allowedOrigins = buildR2CorsAllowedOrigins(cfg.envConfig || {}, requestOrigin);
  const originOk =
    !requestOrigin ||
    allowedOrigins.some((o) => o === requestOrigin || o === '*');

  if (globalThis.__r2CorsEnsured === true && originOk && globalThis.__r2CorsOriginsKey === allowedOrigins.join('|')) {
    return { ok: true, skipped: true, allowedOrigins };
  }

  try {
    const client = createR2S3ClientPlain(cfg);
    const command = new PutBucketCorsCommand({
      Bucket: cfg.bucketName,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ['*'],
            // S3/R2 CORS schema does not accept OPTIONS here; preflight is handled automatically.
            AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
            AllowedOrigins: allowedOrigins,
            ExposeHeaders: ['ETag', 'Content-Length', 'Content-Type'],
            MaxAgeSeconds: 86400,
          },
        ],
      },
    });
    await client.send(command);
    globalThis.__r2CorsEnsured = true;
    globalThis.__r2CorsOriginsKey = allowedOrigins.join('|');
    return { ok: true, skipped: false, allowedOrigins };
  } catch (e) {
    console.warn('[R2] ensureR2CorsForBrowserUploads:', e.message);
    return { ok: false, error: e.message, allowedOrigins };
  }
}

/**
 * S3 client for presigning PUT to R2. Removes CRC32 checksum params that break browser uploads.
 * @see https://github.com/aws/aws-sdk-js-v3/issues — R2 rejects when checksum in query mismatches body.
 */
export function createR2S3ClientForPutPresign(cfg) {
  const s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    forcePathStyle: true,
    requestHandler: createR2RequestHandler(),
  });

  s3Client.middlewareStack.add(
    (next) => async (args) => {
      if (args.request?.query) {
        delete args.request.query['x-amz-checksum-crc32'];
        delete args.request.query['x-amz-sdk-checksum-algorithm'];
      }
      if (args.request?.headers) {
        delete args.request.headers['x-amz-checksum-crc32'];
        delete args.request.headers['x-amz-sdk-checksum-algorithm'];
      }
      return next(args);
    },
    {
      step: 'build',
      name: 'removeChecksumForR2',
      priority: 'low',
    }
  );

  return s3Client;
}

/** Plain client for presigning GET (no upload body / checksum issues). */
export function createR2S3ClientForGetPresign(cfg) {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    forcePathStyle: true,
    requestHandler: createR2RequestHandler(),
  });
}

/** Reject path traversal and absolute keys */
export function assertSafeObjectKey(key) {
  if (!key || typeof key !== 'string') {
    const err = new Error('key is required');
    err.statusCode = 400;
    throw err;
  }
  if (key.includes('..') || key.startsWith('/') || key.includes('\\')) {
    const err = new Error('Invalid key');
    err.statusCode = 400;
    throw err;
  }
}
