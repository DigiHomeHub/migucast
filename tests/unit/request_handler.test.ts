import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/config.js", () => ({
  host: "",
  pass: "",
  rateType: 3,
  token: "defaultToken",
  userId: "defaultUser",
  debug: false,
  logLevel: "info",
  logFile: undefined,
  dataDir: process.cwd(),
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

const mockStorage = {
  get: vi
    .fn<(key: string) => Promise<string | null>>()
    .mockResolvedValue("content ${replace}/123"),
  put: vi
    .fn<(key: string, value: string) => Promise<void>>()
    .mockResolvedValue(undefined),
};

const mockCache = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
};

vi.mock("../../src/platform/context.js", () => ({
  getStorage: () => mockStorage,
  getCache: () => mockCache,
}));

vi.mock("../../src/utils/android_url.js", () => ({
  getAndroidUrl: vi.fn(),
  getAndroidUrl720p: vi.fn(),
  resolveRedirectUrl: vi.fn(),
  printLoginInfo: vi.fn(),
}));

vi.mock("../../src/utils/dd_calcu_url.js", () => ({
  getDdCalcuUrl: vi.fn(),
  getDdCalcuUrl720p: vi.fn(),
}));

vi.mock("../../src/utils/net.js", () => ({
  fetchUrl: vi.fn(),
}));

vi.mock("../../src/utils/channel_list.js", () => ({
  delay: vi.fn(),
}));

import {
  getAndroidUrl,
  getAndroidUrl720p,
  resolveRedirectUrl,
} from "../../src/utils/android_url.js";
import {
  servePlaylist,
  channel,
  channelCache,
} from "../../src/utils/request_handler.js";

const mockGetAndroidURL = vi.mocked(getAndroidUrl);
const mockGetAndroidURL720p = vi.mocked(getAndroidUrl720p);
const mockGet302URL = vi.mocked(resolveRedirectUrl);

beforeEach(() => {
  vi.clearAllMocks();
  mockStorage.get.mockResolvedValue("content ${replace}/123");
  mockCache.get.mockResolvedValue(null);
});

describe("request_handler", () => {
  describe("servePlaylist", () => {
    const defaultHeaders: Record<string, string | undefined> = {
      host: "localhost:1234",
    };

    it("reads and returns playlist.m3u for root URL", async () => {
      const result = await servePlaylist(
        "/",
        defaultHeaders,
        "defaultUser",
        "defaultToken",
      );

      expect(mockStorage.get).toHaveBeenCalledWith("playlist:m3u");
      expect(result.contentType).toBe("text/plain;charset=UTF-8");
      expect(String(result.content)).toContain("http://localhost:1234");
    });

    it("replaces ${replace} with host header", async () => {
      mockStorage.get.mockResolvedValueOnce("stream ${replace}/video");

      const result = await servePlaylist(
        "/",
        defaultHeaders,
        "defaultUser",
        "defaultToken",
      );
      expect(String(result.content)).toBe("stream http://localhost:1234/video");
    });

    it("returns XML content type for /epg.xml", async () => {
      const result = await servePlaylist(
        "/epg.xml",
        defaultHeaders,
        "defaultUser",
        "defaultToken",
      );
      expect(result.contentType).toBe("text/xml;charset=UTF-8");
    });

    it("returns m3u content type for /m3u", async () => {
      const result = await servePlaylist(
        "/m3u",
        defaultHeaders,
        "defaultUser",
        "defaultToken",
      );
      expect(result.contentType).toBe("audio/x-mpegurl; charset=utf-8");
    });

    it("returns m3u content type for /playlist.m3u", async () => {
      const result = await servePlaylist(
        "/playlist.m3u",
        defaultHeaders,
        "defaultUser",
        "defaultToken",
      );
      expect(result.contentType).toBe("audio/x-mpegurl; charset=utf-8");
    });

    it("returns txt file for /txt", async () => {
      const result = await servePlaylist(
        "/txt",
        defaultHeaders,
        "defaultUser",
        "defaultToken",
      );
      expect(result.contentType).toBe("text/plain;charset=UTF-8");
    });

    it("returns txt file for /playlist.txt", async () => {
      const result = await servePlaylist(
        "/playlist.txt",
        defaultHeaders,
        "defaultUser",
        "defaultToken",
      );
      expect(result.contentType).toBe("text/plain;charset=UTF-8");
    });

    it("appends user credentials to replace host when different from defaults", async () => {
      mockStorage.get.mockResolvedValueOnce("url ${replace}/ch");

      const result = await servePlaylist(
        "/",
        defaultHeaders,
        "otherUser",
        "otherToken",
      );
      expect(String(result.content)).toContain("otherUser");
      expect(String(result.content)).toContain("otherToken");
    });

    it("returns null content on read error", async () => {
      mockStorage.get.mockRejectedValueOnce(new Error("storage error"));

      const result = await servePlaylist(
        "/",
        defaultHeaders,
        "defaultUser",
        "defaultToken",
      );
      expect(result.content).toBeNull();
    });
  });

  describe("channel", () => {
    it("returns error for invalid URL format (non-numeric pid)", async () => {
      const result = await channel("/abc", "user1", "token1");
      expect(result.code).toBe(200);
      expect(result.desc).toBe("Invalid URL format");
    });

    it("returns error for empty URL segment", async () => {
      const result = await channel("/", "user1", "token1");
      expect(result.code).toBe(200);
    });

    it("fetches URL via getAndroidUrl720p when no credentials", async () => {
      mockGetAndroidURL720p.mockResolvedValueOnce({
        url: "http://play.example.com/stream",
        rateType: 3,
        content: null,
      });
      mockGet302URL.mockResolvedValueOnce("http://final.example.com/stream");

      const result = await channel("/123456", "", "");

      expect(mockGetAndroidURL720p).toHaveBeenCalledWith("123456");
      expect(result.code).toBe(302);
      expect(result.playUrl).toBe("http://final.example.com/stream");
    });

    it("fetches URL via getAndroidUrl with credentials", async () => {
      mockGetAndroidURL.mockResolvedValueOnce({
        url: "http://play.example.com/stream",
        rateType: 4,
        content: null,
      });
      mockGet302URL.mockResolvedValueOnce("http://final.example.com/stream");

      const result = await channel("/200001", "user1", "token1");

      expect(mockGetAndroidURL).toHaveBeenCalledWith(
        "user1",
        "token1",
        "200001",
        3,
      );
      expect(result.code).toBe(302);
    });

    it("returns error desc when URL is empty", async () => {
      mockGetAndroidURL720p.mockResolvedValueOnce({
        url: "",
        rateType: 0,
        content: { message: "Channel unavailable" },
      });

      const result = await channel("/300001", "", "");
      expect(result.code).toBe(200);
      expect(result.desc).toContain("300001");
      expect(result.desc).toContain("Channel unavailable");
    });

    it("appends URL params when present", async () => {
      mockGetAndroidURL720p.mockResolvedValueOnce({
        url: "http://play.example.com/stream",
        rateType: 3,
        content: null,
      });
      mockGet302URL.mockResolvedValueOnce("http://final.example.com/stream");

      const result = await channel("/400001?key=val", "", "");
      expect(result.playUrl).toContain("key=val");
    });

    it("handles fetch error gracefully", async () => {
      mockGetAndroidURL720p.mockRejectedValueOnce(new Error("network"));

      const result = await channel("/500001", "", "");
      expect(result.desc).toBe("URL request error");
    });
  });

  describe("channelCache", () => {
    it("returns no cache when pid has no cached entry", async () => {
      const result = await channelCache("nonexistent", "");
      expect(result.haveCache).toBe(false);
    });

    it("returns cached URL with 302 for valid cache hit", async () => {
      mockCache.get.mockResolvedValueOnce({
        expiresAt: Date.now() + 3600000,
        url: "http://cached.example.com/stream",
        content: null,
      });
      const result = await channelCache("12345", "");
      expect(result.haveCache).toBe(true);
      expect(result.code).toBe(302);
      expect(result.playUrl).toBe("http://cached.example.com/stream");
      expect(result.cacheDesc).toBe("Cache hit");
    });

    it("returns cached URL with appended params", async () => {
      mockCache.get.mockResolvedValueOnce({
        expiresAt: Date.now() + 3600000,
        url: "http://cached.example.com/stream",
        content: null,
      });
      const result = await channelCache("12345", "key=val&foo=bar");
      expect(result.playUrl).toContain("key=val");
      expect(result.playUrl).toContain("foo=bar");
    });

    it("returns error desc when cached URL is empty", async () => {
      mockCache.get.mockResolvedValueOnce({
        expiresAt: Date.now() + 3600000,
        url: "",
        content: { message: "Unavailable" },
      });
      const result = await channelCache("12345", "");
      expect(result.haveCache).toBe(true);
      expect(result.cacheDesc).toContain("12345");
      expect(result.cacheDesc).toContain("Unavailable");
    });

    it("returns default desc when cached content has no message", async () => {
      mockCache.get.mockResolvedValueOnce({
        expiresAt: Date.now() + 3600000,
        url: "",
        content: {},
      });
      const result = await channelCache("12345", "");
      expect(result.cacheDesc).toContain("temporarily unavailable");
    });

    it("handles cache read error gracefully", async () => {
      mockCache.get.mockRejectedValueOnce(new Error("cache error"));
      const result = await channelCache("12345", "");
      expect(result.haveCache).toBe(false);
      expect(result.cacheDesc).toBe("No cache available");
    });
  });

  describe("channel - cache write failure", () => {
    it("proceeds without cache when cache.set fails", async () => {
      mockGetAndroidURL720p.mockResolvedValueOnce({
        url: "http://play.example.com/stream",
        rateType: 3,
        content: null,
      });
      mockGet302URL.mockResolvedValueOnce("http://final.example.com/stream");
      mockCache.set.mockRejectedValueOnce(new Error("cache write error"));

      const result = await channel("/600001", "", "");
      expect(result.code).toBe(302);
      expect(result.playUrl).toBe("http://final.example.com/stream");
    });
  });

  describe("channel - empty URL with null content message", () => {
    it("uses default message when content is null", async () => {
      mockGetAndroidURL720p.mockResolvedValueOnce({
        url: "",
        rateType: 0,
        content: null,
      });

      const result = await channel("/700001", "", "");
      expect(result.desc).toContain("temporarily unavailable");
    });
  });

  describe("channel - resolveRedirectUrl returns empty", () => {
    it("keeps original URL when redirect returns empty", async () => {
      mockGetAndroidURL720p.mockResolvedValueOnce({
        url: "http://play.example.com/stream",
        rateType: 3,
        content: null,
      });
      mockGet302URL.mockResolvedValueOnce("");

      const result = await channel("/800001", "", "");
      expect(result.code).toBe(302);
      expect(result.playUrl).toBe("http://play.example.com/stream");
    });
  });
});
