import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  KVStorageAdapter,
  KVCacheAdapter,
  ConsoleLoggerAdapter,
  type WorkersKVNamespace,
} from "../../../src/platform/workers.js";
import type { CacheEntry } from "../../../src/types/index.js";

function createMockKV(): WorkersKVNamespace & {
  _store: Record<string, string>;
} {
  const store: Record<string, string> = {};
  return {
    _store: store,
    get: vi.fn((key: string): Promise<string | null> => {
      return Promise.resolve(store[key] ?? null);
    }),
    put: vi.fn((key: string, value: string): Promise<void> => {
      store[key] = value;
      return Promise.resolve();
    }),
  };
}

describe("KVStorageAdapter", () => {
  let mockKV: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    mockKV = createMockKV();
  });

  it("delegates get to KV namespace", async () => {
    const adapter = new KVStorageAdapter(mockKV);
    await adapter.get("playlist:m3u");
    expect(vi.mocked(mockKV.get)).toHaveBeenCalledWith("playlist:m3u", {
      type: "text",
    });
  });

  it("delegates put to KV namespace", async () => {
    const adapter = new KVStorageAdapter(mockKV);
    await adapter.put("epg:xml", "<tv></tv>");
    expect(vi.mocked(mockKV.put)).toHaveBeenCalledWith("epg:xml", "<tv></tv>");
  });

  it("returns null for missing keys", async () => {
    const adapter = new KVStorageAdapter(mockKV);
    const result = await adapter.get("nonexistent");
    expect(result).toBeNull();
  });
});

describe("KVCacheAdapter", () => {
  let mockKV: ReturnType<typeof createMockKV>;
  const entry: CacheEntry = {
    expiresAt: Date.now() + 3600000,
    url: "http://example.com/stream",
    content: null,
  };

  beforeEach(() => {
    mockKV = createMockKV();
  });

  it("stores cache entries with cache: prefix", async () => {
    const cache = new KVCacheAdapter(mockKV);
    await cache.set("pid123", entry, 3600);
    expect(vi.mocked(mockKV.put)).toHaveBeenCalledWith(
      "cache:pid123",
      JSON.stringify(entry),
      { expirationTtl: 3600 },
    );
  });

  it("retrieves and deserializes cache entries", async () => {
    mockKV._store["cache:pid123"] = JSON.stringify(entry);
    const cache = new KVCacheAdapter(mockKV);
    const result = await cache.get("pid123");
    expect(result).toEqual(entry);
  });

  it("returns null for missing entries", async () => {
    const cache = new KVCacheAdapter(mockKV);
    const result = await cache.get("missing");
    expect(result).toBeNull();
  });

  it("returns null for corrupted entries", async () => {
    mockKV._store["cache:corrupted"] = "not-json";
    const cache = new KVCacheAdapter(mockKV);
    const result = await cache.get("corrupted");
    expect(result).toBeNull();
  });

  it("enforces minimum TTL of 60 seconds", async () => {
    const cache = new KVCacheAdapter(mockKV);
    await cache.set("short", entry, 10);
    expect(vi.mocked(mockKV.put)).toHaveBeenCalledWith(
      "cache:short",
      expect.any(String),
      { expirationTtl: 60 },
    );
  });
});

describe("ConsoleLoggerAdapter", () => {
  it("has all required logging methods", () => {
    const adapter = new ConsoleLoggerAdapter();
    expect(typeof adapter.info).toBe("function");
    expect(typeof adapter.warn).toBe("function");
    expect(typeof adapter.error).toBe("function");
    expect(typeof adapter.debug).toBe("function");
    expect(typeof adapter.trace).toBe("function");
  });

  it("delegates info to console.log", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const adapter = new ConsoleLoggerAdapter();
    adapter.info("test message");
    expect(spy).toHaveBeenCalledWith("[INFO]", "test message");
    spy.mockRestore();
  });

  it("delegates error to console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const adapter = new ConsoleLoggerAdapter();
    adapter.error("error message");
    expect(spy).toHaveBeenCalledWith("[ERROR]", "error message");
    spy.mockRestore();
  });
});
