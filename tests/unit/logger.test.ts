import { describe, it, expect, vi, beforeEach } from "vitest";

describe("logger", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("exports logger with all LoggerPort methods", async () => {
    const { logger } = await import("../../src/logger.js");
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.trace).toBe("function");
  });

  it("silently drops logs before setLoggerImpl is called", async () => {
    const { logger } = await import("../../src/logger.js");
    expect(() => logger.info("should not throw")).not.toThrow();
  });

  it("delegates to the registered implementation after setLoggerImpl", async () => {
    const { logger, setLoggerImpl } = await import("../../src/logger.js");
    const mockImpl = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
    };
    setLoggerImpl(mockImpl);

    logger.info("hello");
    logger.warn("warning", { extra: true });
    logger.error(new Error("oops"));

    expect(mockImpl.info).toHaveBeenCalledWith("hello");
    expect(mockImpl.warn).toHaveBeenCalledWith("warning", { extra: true });
    expect(mockImpl.error).toHaveBeenCalledTimes(1);
  });

  it("exports setLoggerImpl function", async () => {
    const mod = await import("../../src/logger.js");
    expect(typeof mod.setLoggerImpl).toBe("function");
  });
});
