/**
 * Platform abstraction interfaces for dual-deployment support.
 * Node.js (Docker) and Cloudflare Workers implement these ports
 * with platform-specific adapters.
 */
import type { CacheEntry } from "../types/index.js";

export interface StoragePort {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export interface CachePort {
  get(key: string): Promise<CacheEntry | null>;
  set(key: string, value: CacheEntry, ttlSeconds: number): Promise<void>;
}

export interface LoggerPort {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  trace(...args: unknown[]): void;
}
