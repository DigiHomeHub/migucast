import { describe, it, expect, vi, beforeEach } from "vitest";
import http from "node:http";

vi.mock("../../src/config.js", () => ({
  config: {
    logLevel: "info",
    logFile: undefined,
    dataDir: ".",
    userId: "defaultUser",
    token: "defaultToken",
  },
  port: 0,
  host: "",
  pass: "",
  token: "defaultToken",
  userId: "defaultUser",
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

import {
  extractAuthAndPath,
  extractCredentials,
  createRequestHandler,
} from "../../src/app.js";
import { servePlaylist, channel } from "../../src/utils/request_handler.js";

const mockServePlaylist = vi.mocked(servePlaylist);
const mockChannel = vi.mocked(channel);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("extractAuthAndPath", () => {
  it("passes through URL when pass is empty", () => {
    const result = extractAuthAndPath("/m3u", "");
    expect(result).toEqual({ url: "/m3u", authenticated: true });
  });

  it("returns null when pass does not match", () => {
    const result = extractAuthAndPath("/wrongpass", "mypass");
    expect(result).toBeNull();
  });

  it("extracts path with correct pass (2 segments)", () => {
    const result = extractAuthAndPath("/mypass", "mypass");
    expect(result).toEqual({ url: "/", authenticated: true });
  });

  it("extracts path with correct pass (3 segments)", () => {
    const result = extractAuthAndPath("/mypass/m3u", "mypass");
    expect(result).toEqual({ url: "/m3u", authenticated: true });
  });

  it("extracts path with correct pass (4+ segments)", () => {
    const result = extractAuthAndPath("/mypass/uid/tok/epg.xml", "mypass");
    expect(result).toEqual({
      url: "/uid/tok/epg.xml",
      authenticated: true,
    });
  });
});

describe("extractCredentials", () => {
  it("returns defaults when URL has no credential pattern", () => {
    const result = extractCredentials("/m3u", "defUser", "defToken");
    expect(result).toEqual({
      url: "/m3u",
      userId: "defUser",
      token: "defToken",
    });
  });

  it("extracts userId and token from URL (3 segments)", () => {
    const result = extractCredentials("/myuser/mytoken", "def", "def");
    expect(result).toEqual({
      url: "/",
      userId: "myuser",
      token: "mytoken",
    });
  });

  it("extracts userId and token from URL (4 segments)", () => {
    const result = extractCredentials("/myuser/mytoken/m3u", "def", "def");
    expect(result).toEqual({
      url: "/m3u",
      userId: "myuser",
      token: "mytoken",
    });
  });

  it("preserves nested route segments after credential extraction", () => {
    const result = extractCredentials(
      "/myuser/mytoken/m3u/%E5%A4%AE%E8%A7%86",
      "def",
      "def",
    );
    expect(result).toEqual({
      url: "/m3u/%E5%A4%AE%E8%A7%86",
      userId: "myuser",
      token: "mytoken",
    });
  });

  it("returns defaults for single-segment URL", () => {
    const result = extractCredentials("/", "defUser", "defToken");
    expect(result).toEqual({
      url: "/",
      userId: "defUser",
      token: "defToken",
    });
  });
});

describe("createRequestHandler", () => {
  function createMockReqRes(
    method: string,
    url: string,
    headers: Record<string, string> = {},
  ) {
    const req = {
      method,
      url,
      headers,
    } as unknown as http.IncomingMessage;

    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
      setHeader: vi.fn(),
      statusCode: 200,
      headersSent: false,
    } as unknown as http.ServerResponse;

    return { req, res };
  }

  const handler = createRequestHandler({
    pass: "",
    userId: "defaultUser",
    token: "defaultToken",
  });

  it("returns 400 when URL is undefined", async () => {
    const req = {
      method: "GET",
      url: undefined,
      headers: {},
    } as unknown as http.IncomingMessage;
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
      headersSent: false,
    } as unknown as http.ServerResponse;

    handler(req, res);
    await vi.waitFor(() => {
      expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    });
  });

  it("returns 204 for favicon.ico", async () => {
    const { req, res } = createMockReqRes("GET", "/favicon.ico");
    handler(req, res);
    await vi.waitFor(() => {
      expect(res.writeHead).toHaveBeenCalledWith(204);
    });
  });

  it("returns auth failure when pass does not match", async () => {
    const authedHandler = createRequestHandler({
      pass: "secret",
      userId: "u",
      token: "t",
    });
    const { req, res } = createMockReqRes("GET", "/wrongpass");
    authedHandler(req, res);
    await vi.waitFor(() => {
      expect(res.end).toHaveBeenCalledWith("Authentication failed");
    });
  });

  it("serves filtered playlist routes when password auth succeeds", async () => {
    const authedHandler = createRequestHandler({
      pass: "secret",
      userId: "defaultUser",
      token: "defaultToken",
    });
    const { req, res } = createMockReqRes("GET", "/secret/playlist.m3u/News", {
      host: "localhost",
    });
    authedHandler(req, res);
    await vi.waitFor(() => {
      expect(mockServePlaylist).toHaveBeenCalledWith(
        "/playlist.m3u/News",
        expect.any(Object),
        "defaultUser",
        "defaultToken",
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        "content-disposition",
        expect.stringContaining("playlist.m3u"),
      );
    });
  });

  it("rejects non-GET requests", async () => {
    const { req, res } = createMockReqRes("POST", "/");
    handler(req, res);
    await vi.waitFor(() => {
      expect(res.end).toHaveBeenCalledWith(expect.stringContaining("GET"));
    });
  });

  it("serves playlist for GET /", async () => {
    const { req, res } = createMockReqRes("GET", "/", { host: "localhost" });
    handler(req, res);
    await vi.waitFor(() => {
      expect(mockServePlaylist).toHaveBeenCalled();
      expect(res.end).toHaveBeenCalledWith("#EXTM3U test");
    });
  });

  it("serves playlist with disposition for /m3u", async () => {
    const { req, res } = createMockReqRes("GET", "/m3u", {
      host: "localhost",
    });
    handler(req, res);
    await vi.waitFor(() => {
      expect(res.setHeader).toHaveBeenCalledWith(
        "content-disposition",
        expect.stringContaining("playlist.m3u"),
      );
    });
  });

  it("serves filtered playlist routes under /m3u/:groupTitle", async () => {
    const { req, res } = createMockReqRes("GET", "/m3u/%E5%A4%AE%E8%A7%86", {
      host: "localhost",
    });
    handler(req, res);
    await vi.waitFor(() => {
      expect(mockServePlaylist).toHaveBeenCalledWith(
        "/m3u/%E5%A4%AE%E8%A7%86",
        expect.any(Object),
        "defaultUser",
        "defaultToken",
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        "content-disposition",
        expect.stringContaining("playlist.m3u"),
      );
    });
  });

  it("supports credential override for nested filtered m3u routes", async () => {
    const { req, res } = createMockReqRes(
      "GET",
      "/customUser/customToken/m3u/News",
      { host: "localhost" },
    );
    handler(req, res);
    await vi.waitFor(() => {
      expect(mockServePlaylist).toHaveBeenCalledWith(
        "/m3u/News",
        expect.any(Object),
        "customUser",
        "customToken",
      );
      expect(res.end).toHaveBeenCalledWith("#EXTM3U test");
    });
  });

  it("uses 'Fetch failed' when playlist content is null", async () => {
    mockServePlaylist.mockResolvedValueOnce({
      content: null,
      contentType: "text/plain",
    });
    const { req, res } = createMockReqRes("GET", "/", { host: "localhost" });
    handler(req, res);
    await vi.waitFor(() => {
      expect(res.end).toHaveBeenCalledWith("Fetch failed");
    });
  });

  it("returns 302 redirect for channel route", async () => {
    const { req, res } = createMockReqRes("GET", "/somechannel");
    handler(req, res);
    await vi.waitFor(() => {
      expect(res.writeHead).toHaveBeenCalledWith(302, expect.any(Object));
    });
  });

  it("extracts credentials for non-playlist routes before resolving channels", async () => {
    const { req, res } = createMockReqRes(
      "GET",
      "/customUser/customToken/12345",
    );
    handler(req, res);
    await vi.waitFor(() => {
      expect(mockChannel).toHaveBeenCalledWith(
        "/12345",
        "customUser",
        "customToken",
      );
      expect(res.writeHead).toHaveBeenCalledWith(302, expect.any(Object));
    });
  });

  it("returns error for non-302 channel result", async () => {
    mockChannel.mockResolvedValueOnce({
      code: 404,
      pid: "",
      desc: "Not found",
      playUrl: "",
    });
    const { req, res } = createMockReqRes("GET", "/badchannel");
    handler(req, res);
    await vi.waitFor(() => {
      expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
      expect(res.end).toHaveBeenCalledWith("Not found");
    });
  });

  it("handles unhandled errors with 500", async () => {
    mockServePlaylist.mockRejectedValueOnce(new Error("boom"));
    const { req, res } = createMockReqRes("GET", "/", { host: "localhost" });
    handler(req, res);
    await vi.waitFor(() => {
      expect(res.writeHead).toHaveBeenCalledWith(500, expect.any(Object));
      expect(res.end).toHaveBeenCalledWith("Internal server error");
    });
  });

  it("passes array headers as joined string", async () => {
    const req = {
      method: "GET",
      url: "/",
      headers: { accept: ["text/html", "application/json"] },
    } as unknown as http.IncomingMessage;
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
      setHeader: vi.fn(),
      statusCode: 200,
      headersSent: false,
    } as unknown as http.ServerResponse;
    handler(req, res);
    await vi.waitFor(() => {
      expect(mockServePlaylist).toHaveBeenCalledWith(
        "/",
        expect.objectContaining({
          accept: "text/html, application/json",
        }),
        expect.any(String),
        expect.any(String),
      );
    });
  });
});
