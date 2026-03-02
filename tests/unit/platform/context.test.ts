import { describe, it, expect, vi, beforeEach } from "vitest";

describe("platform context", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("throws when getStorage is called before initPlatform", async () => {
    const { getStorage } = await import("../../../src/platform/context.js");
    expect(() => getStorage()).toThrow("Platform not initialized");
  });

  it("throws when getCache is called before initPlatform", async () => {
    const { getCache } = await import("../../../src/platform/context.js");
    expect(() => getCache()).toThrow("Platform not initialized");
  });

  it("returns adapters after initPlatform", async () => {
    const { initPlatform, getStorage, getCache, getPlatformLogger } =
      await import("../../../src/platform/context.js");

    const mockStorage = {
      get: vi.fn(),
      put: vi.fn(),
    };
    const mockCache = {
      get: vi.fn(),
      set: vi.fn(),
    };
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
    };

    initPlatform({
      storage: mockStorage,
      cache: mockCache,
      logger: mockLogger,
    });

    expect(getStorage()).toBe(mockStorage);
    expect(getCache()).toBe(mockCache);
    expect(getPlatformLogger()).toBe(mockLogger);
  });

  it("reports initialization state correctly", async () => {
    const { isPlatformInitialized, initPlatform } =
      await import("../../../src/platform/context.js");

    expect(isPlatformInitialized()).toBe(false);

    initPlatform({
      storage: { get: vi.fn(), put: vi.fn() },
      cache: { get: vi.fn(), set: vi.fn() },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
      },
    });

    expect(isPlatformInitialized()).toBe(true);
  });
});
