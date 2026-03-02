/**
 * Cloudflare Workers entry point for migucast.
 * Handles:
 *   - fetch: serves playlists, EPG, and channel redirects
 *   - scheduled: triggers periodic playlist/EPG updates via chunked state machine
 *   - /internal/update-batch: continues chunked update (self-invoked)
 */

/** Minimal local declarations so that tsc --noEmit under the main tsconfig (which lacks @cloudflare/workers-types) still compiles. */
declare global {
  interface ExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
    passThroughOnException(): void;
  }
  interface ScheduledEvent {
    readonly scheduledTime: number;
    readonly cron: string;
    noRetry(): void;
  }
}

import { parseConfig, type FullAppConfig } from "./config.js";
import { setLoggerImpl, logger } from "./logger.js";
import { initPlatform } from "./platform/context.js";
import {
  KVStorageAdapter,
  KVCacheAdapter,
  ConsoleLoggerAdapter,
  type WorkersKVNamespace,
} from "./platform/workers.js";
import { servePlaylist, channel } from "./utils/request_handler.js";
import {
  processUpdateBatch,
  startUpdate,
  type UpdateState,
} from "./workers/chunked_update.js";

export interface Env {
  MIGUCAST_DATA: WorkersKVNamespace;
  UPDATE_SECRET?: string;
  muserId?: string;
  mtoken?: string;
  mhost?: string;
  mpass?: string;
  mrateType?: string;
  mdebug?: string;
  menableHDR?: string;
  menableH265?: string;
  mupdateInterval?: string;
  mlogLevel?: string;
}

function initWorkersPlatform(env: Env): FullAppConfig {
  const consoleLogger = new ConsoleLoggerAdapter();
  setLoggerImpl(consoleLogger);

  const kvStorage = new KVStorageAdapter(env.MIGUCAST_DATA);
  const kvCache = new KVCacheAdapter(env.MIGUCAST_DATA);

  initPlatform({
    storage: kvStorage,
    cache: kvCache,
    logger: consoleLogger,
  });

  return parseConfig(env as unknown as Record<string, string | undefined>);
}

let initialUpdateTriggered = false;

/** Reset the module-level flag (test helper only). */
function resetInitialUpdateFlag(): void {
  initialUpdateTriggered = false;
}

/**
 * Check if KV has existing data; if not, trigger the full update.
 * Guards against duplicate triggers via KV state check.
 */
async function maybeInitialUpdate(env: Env): Promise<void> {
  const kv = env.MIGUCAST_DATA;
  const lastUpdate = await kv.get("meta:lastUpdate", { type: "text" });
  if (lastUpdate) return;

  const stateRaw = await kv.get("update:state", { type: "text" });
  if (stateRaw) {
    const state = JSON.parse(stateRaw) as UpdateState;
    if (state.phase !== "done") return;
  }

  logger.info("No existing data found, triggering initial update");
  await handleScheduled(env);
}

const PLAYLIST_ROUTES = new Set([
  "/",
  "/interface.txt",
  "/m3u",
  "/txt",
  "/epg.xml",
  "/playlist.m3u",
  "/playlist.txt",
]);

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const config = initWorkersPlatform(env);
  const url = new URL(request.url);
  let path = url.pathname;

  if (path === "/favicon.ico") {
    return new Response(null, { status: 204 });
  }

  // Internal update endpoint (called by self-fetch chain)
  if (path === "/internal/update-batch") {
    const authHeader = request.headers.get("Authorization");
    const secret = env.UPDATE_SECRET ?? "migucast-internal";
    if (authHeader !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
    const batchParam = url.searchParams.get("batch");
    const batch = batchParam ? parseInt(batchParam, 10) : 0;
    await processBatchAndChain(env, batch, secret, url.origin);
    return new Response("OK", { status: 200 });
  }

  if (path === "/internal/trigger-update") {
    const authHeader = request.headers.get("Authorization");
    const secret = env.UPDATE_SECRET ?? "migucast-internal";
    if (authHeader !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
    await handleScheduled(env);
    return new Response("Update triggered", { status: 202 });
  }

  // Authentication check
  if (config.pass !== "") {
    const segments = path.split("/");
    if (segments[1] !== config.pass) {
      return new Response("Authentication failed", {
        status: 200,
        headers: { "Content-Type": "application/json;charset=UTF-8" },
      });
    }
    if (segments.length > 3) {
      path = path.substring(config.pass.length + 1);
    } else {
      path =
        segments.length === 2
          ? "/"
          : "/" + (segments[segments.length - 1] ?? "");
    }
  }

  // Extract user credentials from URL
  let urlUserId = config.userId;
  let urlToken = config.token;

  if (/\/{1}[^/\s]{1,}\/{1}[^/\s]{1,}/.test(path)) {
    const segments = path.split("/");
    if (segments.length >= 3) {
      urlUserId = segments[1] ?? "";
      urlToken = segments[2] ?? "";
      path =
        segments.length === 3
          ? "/"
          : "/" + (segments[segments.length - 1] ?? "");
    }
  }

  if (request.method !== "GET") {
    return Response.json({ data: "Please use GET request" });
  }

  // Playlist/EPG routes
  if (PLAYLIST_ROUTES.has(path)) {
    const headers: Record<string, string | undefined> = {};
    for (const [key, value] of request.headers.entries()) {
      headers[key] = value;
    }
    headers.host = url.host;

    const result = await servePlaylist(path, headers, urlUserId, urlToken);
    const responseHeaders: Record<string, string> = {
      "Content-Type": result.contentType,
    };
    if (path === "/m3u" || path === "/playlist.m3u") {
      responseHeaders["content-disposition"] =
        'inline; filename="playlist.m3u"';
    }
    return new Response(result.content ?? "Fetch failed", {
      status: 200,
      headers: responseHeaders,
    });
  }

  // Channel redirect route
  const result = await channel(path, urlUserId, urlToken);

  if (result.code !== 302) {
    return new Response(result.desc, {
      status: result.code,
      headers: { "Content-Type": "application/json;charset=UTF-8" },
    });
  }

  return new Response(null, {
    status: 302,
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      Location: result.playUrl,
    },
  });
}

async function handleScheduled(env: Env): Promise<void> {
  initWorkersPlatform(env);
  const secret = env.UPDATE_SECRET ?? "migucast-internal";
  const origin = resolveOrigin(env);

  logger.info("Cron trigger: starting playlist update");
  const state = await startUpdate(env.MIGUCAST_DATA);

  if (state.totalBatches > 0) {
    await processBatchAndChain(env, 0, secret, origin);
  }
}

/** Derive worker origin for self-fetch chain. Scheduled events have no request URL. */
function resolveOrigin(env: Env): string {
  if (env.mhost) return env.mhost;
  return "https://migucast.workers.dev";
}

async function processBatchAndChain(
  env: Env,
  batch: number,
  secret: string,
  origin: string,
): Promise<void> {
  const kv = env.MIGUCAST_DATA;
  const result = await processUpdateBatch(kv, batch);

  if (!result.completed) {
    try {
      await fetch(`${origin}/internal/update-batch?batch=${batch + 1}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
      });
    } catch (err) {
      logger.error("Self-fetch chain failed, update will resume on next cron");
      logger.error(err);
    }
  } else {
    logger.info("All update batches completed");
  }
}

export {
  initWorkersPlatform,
  handleRequest,
  handleScheduled,
  resolveOrigin,
  processBatchAndChain,
  maybeInitialUpdate,
  resetInitialUpdateFlag,
  PLAYLIST_ROUTES,
};

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    try {
      const response = await handleRequest(request, env);
      if (!initialUpdateTriggered) {
        initialUpdateTriggered = true;
        ctx.waitUntil(maybeInitialUpdate(env));
      }
      return response;
    } catch (error) {
      logger.error(error);
      return new Response("Internal server error", { status: 500 });
    }
  },

  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(handleScheduled(env));
  },
};
