/**
 * Cloudflare Workers platform adapters.
 * KVStorageAdapter and KVCacheAdapter delegate to Workers KV.
 * ConsoleLoggerAdapter provides a minimal logger using console methods.
 */
import type { StoragePort, CachePort, LoggerPort } from "./types.js";
import type { CacheEntry } from "../types/index.js";

export interface WorkersKVNamespace {
  get(key: string, options?: { type: "text" }): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
}

export class KVStorageAdapter implements StoragePort {
  constructor(private kv: WorkersKVNamespace) {}

  async get(key: string): Promise<string | null> {
    return this.kv.get(key, { type: "text" });
  }

  async put(key: string, value: string): Promise<void> {
    await this.kv.put(key, value);
  }
}

export class KVCacheAdapter implements CachePort {
  constructor(private kv: WorkersKVNamespace) {}

  async get(key: string): Promise<CacheEntry | null> {
    const raw = await this.kv.get(`cache:${key}`, { type: "text" });
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CacheEntry;
    } catch {
      return null;
    }
  }

  async set(key: string, value: CacheEntry, ttlSeconds: number): Promise<void> {
    await this.kv.put(`cache:${key}`, JSON.stringify(value), {
      expirationTtl: Math.max(ttlSeconds, 60),
    });
  }
}

export class ConsoleLoggerAdapter implements LoggerPort {
  info(...args: unknown[]): void {
    console.log("[INFO]", ...args);
  }
  warn(...args: unknown[]): void {
    console.warn("[WARN]", ...args);
  }
  error(...args: unknown[]): void {
    console.error("[ERROR]", ...args);
  }
  debug(...args: unknown[]): void {
    console.debug("[DEBUG]", ...args);
  }
  trace(...args: unknown[]): void {
    console.debug("[TRACE]", ...args);
  }
}
