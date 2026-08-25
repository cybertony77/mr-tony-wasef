import { Readable } from 'stream';
import { randomBytes } from 'crypto';

/**
 * Video stream lifecycle helpers.
 *
 * Dependency / hang map (pre-fix findings):
 * - Zoom/Google: fetch() → Readable.fromWeb(body) → pipe(res).
 *   Client disconnect only called stream.destroy(); AbortSignal was NOT tied to
 *   the body lifetime → Undici kept reading upstream → socket leak → stuck until PM2 restart.
 * - Google: fetch() had no timeout → connect can hang forever.
 * - R2 proxy: req/res.setTimeout(30000) risk on stalled ranges; agents lacked free-socket limits.
 * - Google/Mongo: new MongoClient.connect per assert/token path → connection storms under load.
 */

const metrics = {
  activeVideoStreams: 0,
  activeR2Streams: 0,
  activeZoomStreams: 0,
  activeGoogleStreams: 0,
};

export function getVideoStreamMetrics() {
  return { ...metrics };
}

export function createVideoRequestId() {
  return randomBytes(6).toString('hex');
}

function bump(source, delta) {
  metrics.activeVideoStreams = Math.max(0, metrics.activeVideoStreams + delta);
  if (source === 'r2') metrics.activeR2Streams = Math.max(0, metrics.activeR2Streams + delta);
  if (source === 'zoom') metrics.activeZoomStreams = Math.max(0, metrics.activeZoomStreams + delta);
  if (source === 'google') metrics.activeGoogleStreams = Math.max(0, metrics.activeGoogleStreams + delta);
}

export function trackVideoStreamStart(source) {
  bump(source, 1);
}

export function trackVideoStreamEnd(source) {
  bump(source, -1);
}

export function logVideoEvent(phase, fields = {}) {
  const safe = { ...fields };
  delete safe.token;
  delete safe.accessToken;
  delete safe.refreshToken;
  delete safe.authorization;
  delete safe.Authorization;
  console.log(`[video:${phase}]`, safe);
}

export function readEnvInt(envConfig, key, fallback) {
  const raw = envConfig?.[key] ?? process.env[key];
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * Compose multiple AbortSignals without requiring AbortSignal.any (Node 20+).
 * Compatible with Node 18+ used by Next.js 15.
 */
export function composeAbortSignals(signals = []) {
  const list = (Array.isArray(signals) ? signals : []).filter(Boolean);
  if (list.length === 0) return undefined;
  if (list.length === 1) return list[0];
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
    return AbortSignal.any(list);
  }

  const controller = new AbortController();
  const onAbort = () => {
    try {
      controller.abort();
    } catch {
      /* ignore */
    }
  };

  for (const signal of list) {
    if (signal.aborted) {
      onAbort();
      break;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }

  return controller.signal;
}

/**
 * AbortController linked to the browser request for the full upstream lifetime.
 * Connect timeout is cleared once headers arrive so long playback is not killed.
 *
 * Only abort on genuine early client disconnect (response not finished).
 * A bare req "close" after a completed GET must NOT kill an in-flight upstream body.
 */
export function createClientLinkedAbortController(req, { connectTimeoutMs = 0, res = null } = {}) {
  const controller = new AbortController();
  let connectTimer = null;
  let detached = false;

  const clientLeftEarly = () => {
    if (res && (res.writableEnded || res.writableFinished)) return false;
    if (req?.aborted) return true;
    // Mid-stream drop: connection closed while we still owe a response body.
    if (res && !res.writableEnded) return true;
    return Boolean(req?.aborted);
  };

  const onClientGone = () => {
    if (!clientLeftEarly()) return;
    try {
      controller.abort();
    } catch {
      /* ignore */
    }
  };

  if (req && typeof req.on === 'function') {
    req.on('aborted', onClientGone);
    req.on('close', onClientGone);
  }

  if (connectTimeoutMs > 0) {
    connectTimer = setTimeout(() => {
      try {
        controller.abort();
      } catch {
        /* ignore */
      }
    }, connectTimeoutMs);
  }

  return {
    signal: controller.signal,
    controller,
    clearConnectTimeout() {
      if (connectTimer) {
        clearTimeout(connectTimer);
        connectTimer = null;
      }
    },
    abort() {
      this.clearConnectTimeout();
      try {
        controller.abort();
      } catch {
        /* ignore */
      }
    },
    detach() {
      if (detached) return;
      detached = true;
      this.clearConnectTimeout();
      if (req && typeof req.removeListener === 'function') {
        req.removeListener('close', onClientGone);
        req.removeListener('aborted', onClientGone);
      }
    },
  };
}

function attachIdempotentPipeCleanup({
  stream,
  req,
  res,
  source,
  requestId,
  onCleanup,
}) {
  let cleanedUp = false;

  trackVideoStreamStart(source);
  logVideoEvent('upstream-pipe', {
    requestId,
    source,
    active: metrics.activeVideoStreams,
  });

  const cleanup = (reason) => {
    if (cleanedUp) return;
    cleanedUp = true;
    trackVideoStreamEnd(source);
    logVideoEvent(reason === 'abort' ? 'abort' : 'end', {
      requestId,
      source,
      reason: reason || 'done',
      active: metrics.activeVideoStreams,
    });

    try {
      if (typeof req.removeListener === 'function') {
        req.removeListener('close', onClientGone);
        req.removeListener('aborted', onClientGone);
      }
    } catch {
      /* ignore */
    }
    try {
      if (typeof res.removeListener === 'function') {
        res.removeListener('close', onResClose);
        res.removeListener('error', onResError);
      }
    } catch {
      /* ignore */
    }
    try {
      if (typeof stream.removeListener === 'function') {
        stream.removeListener('end', onEnd);
        stream.removeListener('close', onStreamClose);
        stream.removeListener('error', onStreamError);
      }
    } catch {
      /* ignore */
    }

    try {
      if (typeof onCleanup === 'function') onCleanup(reason);
    } catch {
      /* ignore */
    }

    try {
      if (typeof stream.unpipe === 'function') stream.unpipe(res);
    } catch {
      /* ignore */
    }

    try {
      if (stream && typeof stream.destroy === 'function' && !stream.destroyed) {
        stream.destroy();
      }
    } catch {
      /* ignore */
    }

    try {
      if (reason === 'abort' && res && !res.writableEnded && typeof res.destroy === 'function') {
        res.destroy();
      }
    } catch {
      /* ignore */
    }
  };

  const onClientGone = () => {
    if (res?.writableEnded || res?.writableFinished) return;
    cleanup('abort');
  };
  const onResClose = () => {
    if (!res.writableEnded) cleanup('abort');
    else cleanup('close');
  };
  const onResError = () => cleanup('error');
  const onEnd = () => cleanup('end');
  const onStreamClose = () => cleanup('close');
  const onStreamError = (err) => {
    logVideoEvent('error', {
      requestId,
      source,
      error: err?.message || 'stream error',
    });
    cleanup('error');
    try {
      if (!res.writableEnded) {
        if (!res.headersSent) res.status(502).end();
        else res.end();
      }
    } catch {
      /* ignore */
    }
  };

  req.on('close', onClientGone);
  req.on('aborted', onClientGone);
  res.on('close', onResClose);
  res.on('error', onResError);
  stream.on('end', onEnd);
  stream.on('close', onStreamClose);
  stream.on('error', onStreamError);

  stream.pipe(res);
  return { cleanup };
}

/**
 * Pipe a Web ReadableStream (fetch body) to the Node response with idempotent cleanup.
 * onCleanup MUST abort the upstream AbortController so Undici stops reading.
 */
export function pipeWebBodyToResponse({
  webBody,
  req,
  res,
  source,
  requestId,
  onCleanup,
}) {
  const nodeStream = Readable.fromWeb(webBody);
  return attachIdempotentPipeCleanup({
    stream: nodeStream,
    req,
    res,
    source,
    requestId,
    onCleanup,
  });
}

/**
 * Pipe an AWS SDK / Node Readable body with the same cleanup rules.
 */
export function pipeNodeBodyToResponse({
  nodeBody,
  req,
  res,
  source,
  requestId,
  onCleanup,
}) {
  return attachIdempotentPipeCleanup({
    stream: nodeBody,
    req,
    res,
    source,
    requestId,
    onCleanup,
  });
}
