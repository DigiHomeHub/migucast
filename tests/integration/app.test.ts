import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import http from "node:http";

vi.mock("../../src/config.js", () => ({
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

vi.mock("../../src/utils/time.js", () => ({
  getReadableDateTime: vi.fn(() => "2026-02-28 14:30:45"),
  getDateString: vi.fn(() => "20260228"),
  getLogDateTime: vi.fn(() => "2026-02-28 14:30:45:123"),
}));

vi.mock("../../src/utils/update_data.js", () => ({
  updatePlaylistData: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../src/utils/channel_list.js", () => ({
  delay: vi.fn(() => Promise.resolve()),
  fetchCategoryChannels: vi.fn(),
  fetchCategories: vi.fn(),
}));

vi.mock("../../src/utils/request_handler.js", () => ({
  servePlaylist: vi.fn(() => ({
    content: "#EXTM3U test content",
    contentType: "text/plain;charset=UTF-8",
  })),
  channel: vi.fn(() =>
    Promise.resolve({
      code: 302,
      pid: "123",
      desc: "",
      playUrl: "http://stream.example.com/live",
    }),
  ),
}));

vi.mock("../../src/utils/net.js", () => ({
  fetchUrl: vi.fn(),
  getLocalIpAddresses: vi.fn(() => []),
}));

vi.mock("../../src/utils/dd_calcu_url.js", () => ({
  getDdCalcuUrl: vi.fn(),
  getDdCalcuUrl720p: vi.fn(),
}));

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

let server: http.Server | undefined;
let baseURL: string;

beforeAll(async () => {
  const capturedServers: http.Server[] = [];
  const originalListen = http.Server.prototype.listen.bind(
    http.Server.prototype,
  );
  vi.spyOn(http.Server.prototype, "listen").mockImplementation(function (
    this: http.Server,
    ...args: unknown[]
  ) {
    capturedServers.push(this);
    return originalListen.call(this, 0, () => {
      const addr = this.address();
      if (addr && typeof addr === "object") {
        baseURL = `http://127.0.0.1:${addr.port}`;
      }
      const cb = args.find((a) => typeof a === "function") as
        | (() => void)
        | undefined;
      cb?.();
    });
  });

  await import("../../src/app.js");
  await new Promise<void>((resolve) => setTimeout(resolve, 200));
  server = capturedServers[0];

  if (!baseURL) {
    const existing = http.createServer();
    existing.listen(0);
    await new Promise<void>((r) => existing.on("listening", r));
    existing.close();
  }
});

afterAll(() => {
  server?.close();
});

describe("app integration", () => {
  it.skip("serves interface list on GET /", async () => {
    const res = await httpGet(`${baseURL}/`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("EXTM3U");
  });

  it.skip("rejects non-GET requests", async () => {
    const res = await httpRequest(`${baseURL}/`, "POST");
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("GET");
  });
});
