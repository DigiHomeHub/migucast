import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import {
  FileStorageAdapter,
  InMemoryCacheAdapter,
} from "../../../src/platform/node.js";
import type { CacheEntry } from "../../../src/types/index.js";

describe("FileStorageAdapter", () => {
  const testDir = "/tmp/migucast-test-storage";

  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("puts and gets a value", async () => {
    const adapter = new FileStorageAdapter(testDir);
    await adapter.put("playlist:m3u", "#EXTM3U\ncontent");
    const result = await adapter.get("playlist:m3u");
    expect(result).toBe("#EXTM3U\ncontent");
  });

  it("maps colon-separated keys to dot-separated filenames", async () => {
    const adapter = new FileStorageAdapter(testDir);
    await adapter.put("epg:xml", "<tv></tv>");
    expect(fs.existsSync(`${testDir}/epg.xml`)).toBe(true);
  });

  it("returns null for non-existent keys", async () => {
    const adapter = new FileStorageAdapter(testDir);
    const result = await adapter.get("nonexistent:key");
    expect(result).toBeNull();
  });

  it("overwrites existing values", async () => {
    const adapter = new FileStorageAdapter(testDir);
    await adapter.put("playlist:txt", "old");
    await adapter.put("playlist:txt", "new");
    const result = await adapter.get("playlist:txt");
    expect(result).toBe("new");
  });
});

describe("InMemoryCacheAdapter", () => {
  const sampleEntry: CacheEntry = {
    expiresAt: Date.now() + 3600000,
    url: "http://example.com/stream",
    content: null,
  };

  it("returns null for non-existent keys", async () => {
    const cache = new InMemoryCacheAdapter();
    const result = await cache.get("missing");
    expect(result).toBeNull();
  });

  it("stores and retrieves cache entries", async () => {
    const cache = new InMemoryCacheAdapter();
    await cache.set("pid123", sampleEntry, 3600);
    const result = await cache.get("pid123");
    expect(result).toEqual(sampleEntry);
  });

  it("returns null for expired entries", async () => {
    const cache = new InMemoryCacheAdapter();
    const expired: CacheEntry = { ...sampleEntry };
    await cache.set("expired", expired, 0);

    vi.useFakeTimers();
    vi.advanceTimersByTime(1000);

    const result = await cache.get("expired");
    expect(result).toBeNull();

    vi.useRealTimers();
  });

  it("overwrites existing entries", async () => {
    const cache = new InMemoryCacheAdapter();
    await cache.set("pid", sampleEntry, 3600);

    const newEntry: CacheEntry = {
      ...sampleEntry,
      url: "http://new.com/stream",
    };
    await cache.set("pid", newEntry, 3600);

    const result = await cache.get("pid");
    expect(result?.url).toBe("http://new.com/stream");
  });
});
