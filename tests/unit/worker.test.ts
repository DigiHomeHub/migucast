import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/config.js", () => ({
  parseConfig: vi.fn(() => ({
    userId: "testUser",
    token: "testToken",
    port: 1234,
    host: "",
    rateType: 3,
    debug: false,
    pass: "",
    enableHdr: true,
    enableH265: true,
    programInfoUpdateInterval: 6,
    logLevel: "info",
    logFile: undefined,
    dataDir: ".",
  })),
  logLevel: "info",
  logFile: undefined,
}));

vi.mock("../../src/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  },
  setLoggerImpl: vi.fn(),
}));

vi.mock("../../src/platform/context.js", () => ({
  initPlatform: vi.fn(),
}));

vi.mock("../../src/platform/workers.js", () => {
  class MockConsoleLoggerAdapter {
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
    debug = vi.fn();
    trace = vi.fn();
  }
  return {
    KVStorageAdapter: vi.fn(),
    KVCacheAdapter: vi.fn(),
    ConsoleLoggerAdapter: MockConsoleLoggerAdapter,
  };
});

vi.mock("../../src/utils/request_handler.js", () => ({
  servePlaylist: vi.fn(() =>
    Promise.resolve({
      content: "#EXTM3U test",
      contentType: "text/plain;charset=UTF-8",
    }),
  ),
  channel: vi.fn(() =>
    Promise.resolve({
      code: 302,
      pid: "123",
      desc: "",
      playUrl: "http://stream.example.com/live",
    }),
  ),
}));

vi.mock("../../src/workers/chunked_update.js", () => ({
  startUpdate: vi.fn(() =>
    Promise.resolve({ totalBatches: 3, phase: "processing" }),
  ),
  processUpdateBatch: vi.fn(() => Promise.resolve({ completed: true })),
}));

import { parseConfig } from "../../src/config.js";
import { servePlaylist, channel } from "../../src/utils/request_handler.js";
import {
  startUpdate,
  processUpdateBatch,
} from "../../src/workers/chunked_update.js";
import {
  initWorkersPlatform,
  handleRequest,
  handleScheduled,
  resolveOrigin,
  processBatchAndChain,
  maybeInitialUpdate,
  resetInitialUpdateFlag,
} from "../../src/worker.js";
import type { Env } from "../../src/worker.js";

const mockServePlaylist = vi.mocked(servePlaylist);
const mockChannel = vi.mocked(channel);
const mockProcessUpdateBatch = vi.mocked(processUpdateBatch);
const mockStartUpdate = vi.mocked(startUpdate);
const mockParseConfig = vi.mocked(parseConfig);

function createMockKV(): Env["MIGUCAST_DATA"] {
  return {
    get: vi.fn(() => Promise.resolve(null)),
    put: vi.fn(() => Promise.resolve()),
  };
}

function createMockKVWith(
  getImpl: (key: string) => Promise<string | null>,
): Env["MIGUCAST_DATA"] {
  return {
    get: vi.fn(getImpl),
    put: vi.fn(() => Promise.resolve()),
  };
}

function createMockEnv(overrides: Partial<Env> = {}): Env {
  return {
    MIGUCAST_DATA: createMockKV(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetInitialUpdateFlag();
  mockParseConfig.mockReturnValue({
    userId: "testUser",
    token: "testToken",
    port: 1234,
    host: "",
    rateType: 3,
    debug: false,
    pass: "",
    enableHdr: true,
    enableH265: true,
    programInfoUpdateInterval: 6,
    logLevel: "info",
    logFile: undefined,
    dataDir: ".",
  });
});

describe("worker", () => {
  describe("initWorkersPlatform", () => {
    it("calls parseConfig with env and returns config", () => {
      const env = createMockEnv();
      const result = initWorkersPlatform(env);
      expect(mockParseConfig).toHaveBeenCalled();
      expect(result).toHaveProperty("userId");
    });
  });

  describe("resolveOrigin", () => {
    it("returns mhost when set", () => {
      const env = createMockEnv({ mhost: "https://custom.example.com" });
      expect(resolveOrigin(env)).toBe("https://custom.example.com");
    });

    it("returns default workers.dev URL when mhost is not set", () => {
      const env = createMockEnv();
      expect(resolveOrigin(env)).toBe("https://migucast.workers.dev");
    });
  });

  describe("handleRequest", () => {
    it("returns 204 for favicon.ico", async () => {
      const env = createMockEnv();
      const req = new Request("https://test.dev/favicon.ico");
      const res = await handleRequest(req, env);
      expect(res.status).toBe(204);
    });

    it("returns 401 for internal update-batch with wrong auth", async () => {
      const env = createMockEnv({ UPDATE_SECRET: "my-secret" });
      const req = new Request(
        "https://test.dev/internal/update-batch?batch=0",
        { method: "POST", headers: { Authorization: "Bearer wrong" } },
      );
      const res = await handleRequest(req, env);
      expect(res.status).toBe(401);
    });

    it("returns 200 for internal update-batch with correct auth", async () => {
      const env = createMockEnv({ UPDATE_SECRET: "my-secret" });
      const req = new Request(
        "https://test.dev/internal/update-batch?batch=0",
        {
          method: "POST",
          headers: { Authorization: "Bearer my-secret" },
        },
      );
      mockProcessUpdateBatch.mockResolvedValueOnce({ completed: true });
      const res = await handleRequest(req, env);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("OK");
    });

    it("uses default secret when UPDATE_SECRET is not set", async () => {
      const env = createMockEnv();
      const req = new Request("https://test.dev/internal/update-batch", {
        method: "POST",
        headers: { Authorization: "Bearer migucast-internal" },
      });
      mockProcessUpdateBatch.mockResolvedValueOnce({ completed: true });
      const res = await handleRequest(req, env);
      expect(res.status).toBe(200);
    });

    it("returns auth failure when pass is set and does not match", async () => {
      mockParseConfig.mockReturnValue({
        userId: "u",
        token: "t",
        port: 1234,
        host: "",
        rateType: 3,
        debug: false,
        pass: "mypass",
        enableHdr: true,
        enableH265: true,
        programInfoUpdateInterval: 6,
        logLevel: "info",
        logFile: undefined,
        dataDir: ".",
      });
      const env = createMockEnv();
      const req = new Request("https://test.dev/wrongpass");
      const res = await handleRequest(req, env);
      expect(await res.text()).toBe("Authentication failed");
    });

    it("strips pass from path when authenticated (2 segments)", async () => {
      mockParseConfig.mockReturnValue({
        userId: "u",
        token: "t",
        port: 1234,
        host: "",
        rateType: 3,
        debug: false,
        pass: "mypass",
        enableHdr: true,
        enableH265: true,
        programInfoUpdateInterval: 6,
        logLevel: "info",
        logFile: undefined,
        dataDir: ".",
      });
      const env = createMockEnv();
      const req = new Request("https://test.dev/mypass");
      await handleRequest(req, env);
      expect(mockServePlaylist).toHaveBeenCalledWith(
        "/",
        expect.any(Object),
        "u",
        "t",
      );
    });

    it("strips pass from path when authenticated (3+ segments)", async () => {
      mockParseConfig.mockReturnValue({
        userId: "u",
        token: "t",
        port: 1234,
        host: "",
        rateType: 3,
        debug: false,
        pass: "mypass",
        enableHdr: true,
        enableH265: true,
        programInfoUpdateInterval: 6,
        logLevel: "info",
        logFile: undefined,
        dataDir: ".",
      });
      const env = createMockEnv();
      const req = new Request("https://test.dev/mypass/epg.xml");
      await handleRequest(req, env);
      expect(mockServePlaylist).toHaveBeenCalledWith(
        "/epg.xml",
        expect.any(Object),
        "u",
        "t",
      );
    });

    it("rejects non-GET requests with JSON message", async () => {
      const env = createMockEnv();
      const req = new Request("https://test.dev/", { method: "POST" });
      const res = await handleRequest(req, env);
      const body = (await res.json()) as { data: string };
      expect(body.data).toContain("GET");
    });

    it("serves playlist for GET / route", async () => {
      const env = createMockEnv();
      const req = new Request("https://test.dev/");
      const res = await handleRequest(req, env);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("EXTM3U");
    });

    it("serves playlist for /m3u with content-disposition header", async () => {
      const env = createMockEnv();
      const req = new Request("https://test.dev/m3u");
      const res = await handleRequest(req, env);
      expect(res.headers.get("content-disposition")).toContain("playlist.m3u");
    });

    it("returns fallback message when playlist content is null", async () => {
      mockServePlaylist.mockResolvedValueOnce({
        content: null,
        contentType: "text/plain",
      });
      const env = createMockEnv();
      const req = new Request("https://test.dev/");
      const res = await handleRequest(req, env);
      expect(await res.text()).toBe(
        "Data not available yet. Update may be in progress.",
      );
    });

    it("returns fallback message when playlist content is empty string", async () => {
      mockServePlaylist.mockResolvedValueOnce({
        content: "",
        contentType: "text/plain",
      });
      const env = createMockEnv();
      const req = new Request("https://test.dev/");
      const res = await handleRequest(req, env);
      expect(await res.text()).toBe(
        "Data not available yet. Update may be in progress.",
      );
    });

    it("returns 302 redirect for channel route", async () => {
      const env = createMockEnv();
      const req = new Request("https://test.dev/somechannel");
      const res = await handleRequest(req, env);
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe(
        "http://stream.example.com/live",
      );
    });

    it("returns error response for non-302 channel result", async () => {
      mockChannel.mockResolvedValueOnce({
        code: 404,
        pid: "",
        desc: "Channel not found",
        playUrl: "",
      });
      const env = createMockEnv();
      const req = new Request("https://test.dev/badchannel");
      const res = await handleRequest(req, env);
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("Channel not found");
    });

    it("extracts user credentials from URL path", async () => {
      const env = createMockEnv();
      const req = new Request("https://test.dev/myuser/mytoken/m3u");
      await handleRequest(req, env);
      expect(mockServePlaylist).toHaveBeenCalledWith(
        "/m3u",
        expect.any(Object),
        "myuser",
        "mytoken",
      );
    });

    it("strips pass and handles longer paths (>3 segments)", async () => {
      mockParseConfig.mockReturnValue({
        userId: "u",
        token: "t",
        port: 1234,
        host: "",
        rateType: 3,
        debug: false,
        pass: "mypass",
        enableHdr: true,
        enableH265: true,
        programInfoUpdateInterval: 6,
        logLevel: "info",
        logFile: undefined,
        dataDir: ".",
      });
      const env = createMockEnv();
      const req = new Request("https://test.dev/mypass/uid/tok/epg.xml");
      await handleRequest(req, env);
      expect(mockServePlaylist).toHaveBeenCalledWith(
        "/epg.xml",
        expect.any(Object),
        "uid",
        "tok",
      );
    });
  });

  describe("handleScheduled", () => {
    it("starts update and processes batches when totalBatches > 0", async () => {
      const env = createMockEnv();
      mockStartUpdate.mockResolvedValueOnce({
        phase: "processing",
        totalBatches: 3,
        currentBatch: 0,
        totalChannels: 0,
        startedAt: Date.now(),
        hours: 0,
        categories: [],
      });
      mockProcessUpdateBatch.mockResolvedValueOnce({ completed: true });
      await handleScheduled(env);
      expect(mockStartUpdate).toHaveBeenCalled();
      expect(mockProcessUpdateBatch).toHaveBeenCalled();
    });

    it("skips processing when totalBatches is 0", async () => {
      const env = createMockEnv();
      mockStartUpdate.mockResolvedValueOnce({
        phase: "processing",
        totalBatches: 0,
        currentBatch: 0,
        totalChannels: 0,
        startedAt: Date.now(),
        hours: 0,
        categories: [],
      });
      await handleScheduled(env);
      expect(mockProcessUpdateBatch).not.toHaveBeenCalled();
    });

    it("uses originOverride for self-fetch chain when provided", async () => {
      const env = createMockEnv();
      mockStartUpdate.mockResolvedValueOnce({
        phase: "processing",
        totalBatches: 1,
        currentBatch: 0,
        totalChannels: 5,
        startedAt: Date.now(),
        hours: 0,
        categories: [],
      });
      mockProcessUpdateBatch.mockResolvedValueOnce({ completed: false });
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response("OK"));
      await handleScheduled(env, "https://custom.example.com");
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("https://custom.example.com/"),
        expect.any(Object),
      );
      fetchSpy.mockRestore();
    });
  });

  describe("processBatchAndChain", () => {
    it("does not chain fetch when batch is completed", async () => {
      const env = createMockEnv();
      mockProcessUpdateBatch.mockResolvedValueOnce({ completed: true });
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response("OK"));
      await processBatchAndChain(env, 0, "secret", "https://test.dev");
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it("chains self-fetch when batch is not completed", async () => {
      const env = createMockEnv();
      mockProcessUpdateBatch.mockResolvedValueOnce({ completed: false });
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response("OK"));
      await processBatchAndChain(env, 2, "secret", "https://test.dev");
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://test.dev/internal/update-batch?batch=3",
        expect.objectContaining({
          method: "POST",
          headers: { Authorization: "Bearer secret" },
        }),
      );
      fetchSpy.mockRestore();
    });

    it("handles self-fetch chain failure gracefully", async () => {
      const env = createMockEnv();
      mockProcessUpdateBatch.mockResolvedValueOnce({ completed: false });
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("network fail"));
      await processBatchAndChain(env, 0, "secret", "https://test.dev");
      expect(fetchSpy).toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });

  describe("maybeInitialUpdate", () => {
    it("triggers update when no data exists in KV", async () => {
      const env = createMockEnv();
      mockStartUpdate.mockResolvedValueOnce({
        phase: "processing",
        totalBatches: 1,
        currentBatch: 0,
        totalChannels: 5,
        startedAt: Date.now(),
        hours: 0,
        categories: [],
      });
      mockProcessUpdateBatch.mockResolvedValueOnce({ completed: true });
      await maybeInitialUpdate(env, "https://test.dev");
      expect(mockStartUpdate).toHaveBeenCalled();
    });

    it("skips when meta:lastUpdate exists", async () => {
      const kv = createMockKVWith((key) => {
        if (key === "meta:lastUpdate")
          return Promise.resolve("2026-03-02T00:00:00Z");
        return Promise.resolve(null);
      });
      const env = createMockEnv({ MIGUCAST_DATA: kv });
      await maybeInitialUpdate(env, "https://test.dev");
      expect(mockStartUpdate).not.toHaveBeenCalled();
    });

    it("skips when update is in progress", async () => {
      const kv = createMockKVWith((key) => {
        if (key === "update:state")
          return Promise.resolve(JSON.stringify({ phase: "processing" }));
        return Promise.resolve(null);
      });
      const env = createMockEnv({ MIGUCAST_DATA: kv });
      await maybeInitialUpdate(env, "https://test.dev");
      expect(mockStartUpdate).not.toHaveBeenCalled();
    });

    it("triggers update when previous update state is done", async () => {
      const kv = createMockKVWith((key) => {
        if (key === "update:state")
          return Promise.resolve(JSON.stringify({ phase: "done" }));
        return Promise.resolve(null);
      });
      const env = createMockEnv({ MIGUCAST_DATA: kv });
      mockStartUpdate.mockResolvedValueOnce({
        phase: "processing",
        totalBatches: 1,
        currentBatch: 0,
        totalChannels: 5,
        startedAt: Date.now(),
        hours: 0,
        categories: [],
      });
      mockProcessUpdateBatch.mockResolvedValueOnce({ completed: true });
      await maybeInitialUpdate(env, "https://test.dev");
      expect(mockStartUpdate).toHaveBeenCalled();
    });
  });

  describe("handleRequest /internal/trigger-update", () => {
    it("returns 401 with wrong auth", async () => {
      const env = createMockEnv({ UPDATE_SECRET: "my-secret" });
      const req = new Request("https://test.dev/internal/trigger-update", {
        method: "POST",
        headers: { Authorization: "Bearer wrong" },
      });
      const res = await handleRequest(req, env);
      expect(res.status).toBe(401);
    });

    it("returns 202 and triggers update with correct auth", async () => {
      const env = createMockEnv({ UPDATE_SECRET: "my-secret" });
      const req = new Request("https://test.dev/internal/trigger-update", {
        method: "POST",
        headers: { Authorization: "Bearer my-secret" },
      });
      mockStartUpdate.mockResolvedValueOnce({
        phase: "processing",
        totalBatches: 1,
        currentBatch: 0,
        totalChannels: 5,
        startedAt: Date.now(),
        hours: 0,
        categories: [],
      });
      mockProcessUpdateBatch.mockResolvedValueOnce({ completed: true });
      const res = await handleRequest(req, env);
      expect(res.status).toBe(202);
      expect(await res.text()).toBe("Update triggered");
      expect(mockStartUpdate).toHaveBeenCalled();
    });

    it("uses default secret when UPDATE_SECRET is not set", async () => {
      const env = createMockEnv();
      const req = new Request("https://test.dev/internal/trigger-update", {
        method: "POST",
        headers: { Authorization: "Bearer migucast-internal" },
      });
      mockStartUpdate.mockResolvedValueOnce({
        phase: "processing",
        totalBatches: 0,
        currentBatch: 0,
        totalChannels: 0,
        startedAt: Date.now(),
        hours: 0,
        categories: [],
      });
      const res = await handleRequest(req, env);
      expect(res.status).toBe(202);
    });
  });

  describe("default export", () => {
    it("fetch handler catches errors and returns 500", async () => {
      const workerModule = await import("../../src/worker.js");
      mockParseConfig.mockImplementation(() => {
        throw new Error("boom");
      });
      const env = createMockEnv();
      const req = new Request("https://test.dev/");
      const ctx = {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      };
      const res = await workerModule.default.fetch(
        req,
        env,
        ctx as unknown as Parameters<typeof workerModule.default.fetch>[2],
      );
      expect(res.status).toBe(500);
      expect(await res.text()).toBe("Internal server error");
    });

    it("calls waitUntil with maybeInitialUpdate on first request", async () => {
      const workerModule = await import("../../src/worker.js");
      workerModule.resetInitialUpdateFlag();
      const kv = createMockKVWith((key) => {
        if (key === "meta:lastUpdate")
          return Promise.resolve("2026-03-02T00:00:00Z");
        return Promise.resolve(null);
      });
      const env = createMockEnv({ MIGUCAST_DATA: kv });
      const req = new Request("https://test.dev/");
      const waitUntilFn = vi.fn();
      const ctx = {
        waitUntil: waitUntilFn,
        passThroughOnException: vi.fn(),
      };
      await workerModule.default.fetch(
        req,
        env,
        ctx as unknown as Parameters<typeof workerModule.default.fetch>[2],
      );
      expect(waitUntilFn).toHaveBeenCalledTimes(1);
    });

    it("does not call waitUntil on subsequent requests", async () => {
      const workerModule = await import("../../src/worker.js");
      workerModule.resetInitialUpdateFlag();
      const kv = createMockKVWith((key) => {
        if (key === "meta:lastUpdate")
          return Promise.resolve("2026-03-02T00:00:00Z");
        return Promise.resolve(null);
      });
      const env = createMockEnv({ MIGUCAST_DATA: kv });
      const ctx = {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      };
      const req1 = new Request("https://test.dev/");
      await workerModule.default.fetch(
        req1,
        env,
        ctx as unknown as Parameters<typeof workerModule.default.fetch>[2],
      );
      expect(ctx.waitUntil).toHaveBeenCalledTimes(1);

      ctx.waitUntil.mockClear();
      const req2 = new Request("https://test.dev/m3u");
      await workerModule.default.fetch(
        req2,
        env,
        ctx as unknown as Parameters<typeof workerModule.default.fetch>[2],
      );
      expect(ctx.waitUntil).not.toHaveBeenCalled();
    });

    it("scheduled handler calls waitUntil", async () => {
      const workerModule = await import("../../src/worker.js");
      mockStartUpdate.mockResolvedValueOnce({
        phase: "processing",
        totalBatches: 0,
        currentBatch: 0,
        totalChannels: 0,
        startedAt: Date.now(),
        hours: 0,
        categories: [],
      });
      const env = createMockEnv();
      const waitUntilFn = vi.fn();
      const ctx = {
        waitUntil: waitUntilFn,
        passThroughOnException: vi.fn(),
      };
      const event = {};
      await workerModule.default.scheduled(
        event as unknown as Parameters<
          typeof workerModule.default.scheduled
        >[0],
        env,
        ctx as unknown as Parameters<typeof workerModule.default.scheduled>[2],
      );
      expect(waitUntilFn).toHaveBeenCalled();
    });
  });
});
