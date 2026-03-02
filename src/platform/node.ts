/**
 * Node.js platform adapters for Docker deployment.
 * FileStorageAdapter maps KV-style keys to filesystem paths.
 * InMemoryCacheAdapter provides a TTL-based Map cache.
 * TslogAdapter wraps the tslog Logger instance.
 */
import fs from "node:fs";
import { Logger, type ILogObj } from "tslog";
import type { StoragePort, CachePort, LoggerPort } from "./types.js";
import type { CacheEntry } from "../types/index.js";

export class FileStorageAdapter implements StoragePort {
  constructor(private dataDir: string) {}

  get(key: string): Promise<string | null> {
    const filePath = this.keyToPath(key);
    try {
      return Promise.resolve(fs.readFileSync(filePath, "utf-8"));
    } catch {
      return Promise.resolve(null);
    }
  }

  put(key: string, value: string): Promise<void> {
    const filePath = this.keyToPath(key);
    fs.writeFileSync(filePath, value);
    return Promise.resolve();
  }

  private keyToPath(key: string): string {
    const fileName = key.replace(":", ".");
    return `${this.dataDir}/${fileName}`;
  }
}

export class InMemoryCacheAdapter implements CachePort {
  private store = new Map<string, { entry: CacheEntry; expiresAt: number }>();

  get(key: string): Promise<CacheEntry | null> {
    const item = this.store.get(key);
    if (!item) return Promise.resolve(null);
    if (Date.now() > item.expiresAt) {
      this.store.delete(key);
      return Promise.resolve(null);
    }
    return Promise.resolve(item.entry);
  }

  set(key: string, value: CacheEntry, ttlSeconds: number): Promise<void> {
    this.store.set(key, {
      entry: value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    return Promise.resolve();
  }
}

type LogLevelName =
  | "silly"
  | "trace"
  | "debug"
  | "info"
  | "warn"
  | "error"
  | "fatal";

const LOG_LEVEL_MAP: Record<LogLevelName, number> = {
  silly: 0,
  trace: 1,
  debug: 2,
  info: 3,
  warn: 4,
  error: 5,
  fatal: 6,
};

interface TslogAdapterOptions {
  logLevel: LogLevelName;
  logFile?: string;
  isProduction?: boolean;
}

export class TslogAdapter implements LoggerPort {
  private tslog: Logger<ILogObj>;

  constructor(opts: TslogAdapterOptions) {
    this.tslog = new Logger({
      name: "migucast",
      minLevel: LOG_LEVEL_MAP[opts.logLevel],
      type: opts.isProduction ? "json" : "pretty",
    });

    if (opts.logFile) {
      const logStream = fs.createWriteStream(opts.logFile, { flags: "a" });
      this.tslog.attachTransport((logObj: ILogObj) => {
        logStream.write(JSON.stringify(logObj) + "\n");
      });
    }
  }

  info(...args: unknown[]): void {
    this.tslog.info(...args);
  }
  warn(...args: unknown[]): void {
    this.tslog.warn(...args);
  }
  error(...args: unknown[]): void {
    this.tslog.error(...args);
  }
  debug(...args: unknown[]): void {
    this.tslog.debug(...args);
  }
  trace(...args: unknown[]): void {
    this.tslog.trace(...args);
  }
}
