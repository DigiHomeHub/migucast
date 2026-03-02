import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import http from "node:http";

vi.mock("../../src/config.js", () => ({
  config: {
    logLevel: "info",
    logFile: undefined,
    dataDir: ".",
    userId: "testUser",
    token: "testToken",
  },
  port: 0,
  host: "",
  pass: "",
  token: "testToken",
  userId: "testUser",
  rateType: 3,
  debug: false,
  programInfoUpdateInterval: 999,
  enableHDR: false,
  enableH265: false,
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

vi.mock("../../src/platform/node.js", () => {
  class MockTslogAdapter {
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
    debug = vi.fn();
    trace = vi.fn();
  }
  return {
    FileStorageAdapter: vi.fn(),
    InMemoryCacheAdapter: vi.fn(),
    TslogAdapter: MockTslogAdapter,
  };
});

vi.mock("../../src/utils/time.js", () => ({
  getReadableDateTime: vi.fn(() => "2026-03-02 12:00:00"),
}));

vi.mock("../../src/utils/update_data.js", () => ({
  updatePlaylistData: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../src/utils/request_handler.js", () => ({
  servePlaylist: vi.fn(() =>
    Promise.resolve({
      content: "#EXTM3U test content",
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

import { createRequestHandler } from "../../src/app.js";

function httpGet(url: string): Promise<{
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => {
          body += chunk.toString();
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            headers: res.headers,
            body,
          });
        });
      })
      .on("error", reject);
  });
}

function httpRequest(
  url: string,
  method: string,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method }, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      res.on("end", () => {
        resolve({ statusCode: res.statusCode ?? 0, body });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

let server: http.Server;
let baseURL: string;

beforeAll(async () => {
  const handler = createRequestHandler({
    pass: "",
    userId: "testUser",
    token: "testToken",
  });
  server = http.createServer(handler);

  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        baseURL = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

afterAll(() => {
  server?.close();
});

describe("app integration", () => {
  it("serves interface list on GET /", async () => {
    const res = await httpGet(`${baseURL}/`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("EXTM3U");
  });

  it("rejects non-GET requests", async () => {
    const res = await httpRequest(`${baseURL}/`, "POST");
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("GET");
  });
});
