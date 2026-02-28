import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ILogObj } from "tslog";

vi.mock("../../src/config.js", () => ({
  logLevel: "info",
  logFile: undefined,
}));

describe("logger", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exports a Logger instance with name 'migucast'", async () => {
    const { logger } = await import("../../src/logger.js");
    expect(logger).toBeDefined();
    expect(logger.settings.name).toBe("migucast");
  });

  it("defaults to pretty mode when NODE_ENV is not production", async () => {
    delete process.env.NODE_ENV;
    const { logger } = await import("../../src/logger.js");
    expect(logger.settings.type).toBe("pretty");
  });

  it("uses json mode when NODE_ENV is production", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const { logger } = await import("../../src/logger.js");
      expect(logger.settings.type).toBe("json");
    } finally {
      if (original === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = original;
      }
    }
  });

  it("respects configured log level", async () => {
    const { logger } = await import("../../src/logger.js");
    expect(logger.settings.minLevel).toBe(3);
  });

  it("attaches file transport when logFile is configured", async () => {
    const writeFn = vi.fn();
    vi.doMock("node:fs", () => ({
      default: {
        createWriteStream: vi.fn(() => ({ write: writeFn })),
      },
    }));
    vi.doMock("../../src/config.js", () => ({
      logLevel: "info",
      logFile: "/tmp/migucast-test.log",
    }));

    const { logger } = await import("../../src/logger.js");
    logger.info("test file transport");

    expect(writeFn).toHaveBeenCalled();
    const written = writeFn.mock.calls[0]?.[0] as string;
    expect(written).toContain("test file transport");
    const parsed = JSON.parse(written.trim()) as ILogObj;
    expect(parsed).toHaveProperty("_meta");
  });
});
