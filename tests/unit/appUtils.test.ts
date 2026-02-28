import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/config.js", () => ({
  host: "",
  pass: "",
  rateType: 3,
  token: "defaultToken",
  userId: "defaultUser",
  debug: false,
}));

vi.mock("../../src/utils/time.js", () => ({
  getLogDateTime: vi.fn(() => "2026-01-01 00:00:00:000"),
}));

vi.mock("../../src/utils/fileUtil.js", () => ({
  readFileSync: vi.fn(() => Buffer.from("content ${replace}/123")),
}));

vi.mock("../../src/utils/androidURL.js", () => ({
  getAndroidURL: vi.fn(),
  getAndroidURL720p: vi.fn(),
  get302URL: vi.fn(),
  printLoginInfo: vi.fn(),
}));

vi.mock("../../src/utils/ddCalcuURL.js", () => ({
  getddCalcuURL: vi.fn(),
  getddCalcuURL720p: vi.fn(),
}));

vi.mock("../../src/utils/net.js", () => ({
  fetchUrl: vi.fn(),
}));

vi.mock("../../src/utils/fetchList.js", () => ({
  delay: vi.fn(),
}));

import { readFileSync } from "../../src/utils/fileUtil.js";
import {
  getAndroidURL,
  getAndroidURL720p,
  get302URL,
} from "../../src/utils/androidURL.js";
import {
  interfaceStr,
  channel,
  channelCache,
} from "../../src/utils/appUtils.js";
import type { IncomingHttpHeaders } from "node:http";

const mockReadFileSync = vi.mocked(readFileSync);
const mockGetAndroidURL = vi.mocked(getAndroidURL);
const mockGetAndroidURL720p = vi.mocked(getAndroidURL720p);
const mockGet302URL = vi.mocked(get302URL);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("appUtils", () => {
  describe("interfaceStr", () => {
    const defaultHeaders: IncomingHttpHeaders = { host: "localhost:1234" };

    it("reads and returns interface.txt for root URL", () => {
      const result = interfaceStr(
        "/",
        defaultHeaders,
        "defaultUser",
        "defaultToken",
      );

      expect(mockReadFileSync).toHaveBeenCalled();
      expect(result.contentType).toBe("text/plain;charset=UTF-8");
      expect(String(result.content)).toContain("http://localhost:1234");
    });

    it("replaces ${replace} with host header", () => {
      mockReadFileSync.mockReturnValueOnce(
        Buffer.from("stream ${replace}/video"),
      );

      const result = interfaceStr(
        "/",
        defaultHeaders,
        "defaultUser",
        "defaultToken",
      );
      expect(String(result.content)).toBe("stream http://localhost:1234/video");
    });

    it("returns XML content type for /epg.xml", () => {
      const result = interfaceStr(
        "/epg.xml",
        defaultHeaders,
        "defaultUser",
        "defaultToken",
      );
      expect(result.contentType).toBe("text/xml;charset=UTF-8");
    });

    it("returns m3u content type for /m3u", () => {
      const result = interfaceStr(
        "/m3u",
        defaultHeaders,
        "defaultUser",
        "defaultToken",
      );
      expect(result.contentType).toBe("audio/x-mpegurl; charset=utf-8");
    });

    it("returns txt file for /txt", () => {
      const result = interfaceStr(
        "/txt",
        defaultHeaders,
        "defaultUser",
        "defaultToken",
      );
      expect(result.contentType).toBe("text/plain;charset=UTF-8");
    });

    it("appends user credentials to replace host when different from defaults", () => {
      mockReadFileSync.mockReturnValueOnce(Buffer.from("url ${replace}/ch"));

      const result = interfaceStr(
        "/",
        defaultHeaders,
        "otherUser",
        "otherToken",
      );
      expect(String(result.content)).toContain("otherUser");
      expect(String(result.content)).toContain("otherToken");
    });

    it("returns null content on read error", () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      mockReadFileSync.mockImplementationOnce(() => {
        throw new Error("file not found");
      });

      const result = interfaceStr(
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

    it("fetches URL via getAndroidURL720p when no credentials", async () => {
      mockGetAndroidURL720p.mockResolvedValueOnce({
        url: "http://play.example.com/stream",
        rateType: 3,
        content: null,
      });
      mockGet302URL.mockResolvedValueOnce("http://final.example.com/stream");

      const result = await channel("/123456", "", "");

      expect(mockGetAndroidURL720p).toHaveBeenCalledWith("123456");
      expect(result.code).toBe(302);
      expect(result.playURL).toBe("http://final.example.com/stream");
    });

    it("fetches URL via getAndroidURL with credentials", async () => {
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
      expect(result.playURL).toContain("key=val");
    });

    it("handles fetch error gracefully", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      mockGetAndroidURL720p.mockRejectedValueOnce(new Error("network"));

      const result = await channel("/500001", "", "");
      expect(result.desc).toBe("URL request error");
    });
  });

  describe("channelCache", () => {
    it("returns no cache when pid has no cached entry", () => {
      const result = channelCache("nonexistent", "");
      expect(result.haveCache).toBe(false);
    });
  });
});
