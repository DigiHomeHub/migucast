/**
 * Runtime platform context holder.
 * Each deployment target (Node.js / Workers) calls `initPlatform()` once at startup
 * to register its adapter implementations.
 */
import type { StoragePort, CachePort, LoggerPort } from "./types.js";

export interface PlatformContext {
  storage: StoragePort;
  cache: CachePort;
  logger: LoggerPort;
}

let _ctx: PlatformContext | null = null;

export function initPlatform(ctx: PlatformContext): void {
  _ctx = ctx;
}

export function getStorage(): StoragePort {
  if (!_ctx) throw new Error("Platform not initialized: storage unavailable");
  return _ctx.storage;
}

export function getCache(): CachePort {
  if (!_ctx) throw new Error("Platform not initialized: cache unavailable");
  return _ctx.cache;
}

export function getPlatformLogger(): LoggerPort {
  if (!_ctx) throw new Error("Platform not initialized: logger unavailable");
  return _ctx.logger;
}

export function isPlatformInitialized(): boolean {
  return _ctx !== null;
}
