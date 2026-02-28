import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/config.js", () => ({
  enableHdr: false,
  enableH265: false,
  debug: false,
}));

vi.mock("../../src/utils/time.js", () => ({
  getLogDateTime: vi.fn(() => "2026-01-01 00:00:00:000"),
}));

vi.mock("../../src/api/migu_client.js", () => ({
  fetchPlaybackUrl: vi.fn(),
  fetchPlaybackUrl720p: vi.fn(),
}));

vi.mock("../../src/utils/dd_calcu_url.js", () => ({
  getDdCalcuUrl: vi.fn(
    (url: string) => url + "&ddCalcu=mocked&sv=10004&ct=android",
  ),
  getDdCalcuUrl720p: vi.fn(
    (url: string) => url + "&ddCalcu=mocked720p&sv=10004&ct=android",
  ),
}));

vi.mock("../../src/utils/channel_list.js", () => ({
  delay: vi.fn(() => Promise.resolve()),
}));

import {
  fetchPlaybackUrl,
  fetchPlaybackUrl720p,
} from "../../src/api/migu_client.js";
import {
  getAndroidUrl,
  getAndroidUrl720p,
  resolveRedirectUrl,
  printLoginInfo,
} from "../../src/utils/android_url.js";

const mockFetchPlaybackUrl = vi.mocked(fetchPlaybackUrl);
const mockFetchPlaybackUrl720p = vi.mocked(fetchPlaybackUrl720p);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("android_url", () => {
  describe("getAndroidUrl", () => {
    it("returns empty result when rateType <= 1", async () => {
      const result = await getAndroidUrl("user1", "token1", "pid1", 1);
      expect(result).toEqual({ url: "", rateType: 0, content: null });
      expect(mockFetchPlaybackUrl).not.toHaveBeenCalled();
    });

    it("returns encrypted URL on success", async () => {
      mockFetchPlaybackUrl.mockResolvedValueOnce({
        body: {
          urlInfo: {
            url: "http://play.example.com/live?puData=abc",
            rateType: "4",
          },
          content: { contId: "pid1" },
        },
      });

      const result = await getAndroidUrl("user1", "token1", "pid1", 4);

      expect(result.url).toContain("&ddCalcu=mocked");
      expect(result.rateType).toBe(4);
    });

    it("returns empty URL when urlInfo.url is missing", async () => {
      mockFetchPlaybackUrl.mockResolvedValueOnce({
        body: { urlInfo: {} },
      });

      const result = await getAndroidUrl("user1", "token1", "pid1", 4);
      expect(result.url).toBe("");
      expect(result.rateType).toBe(0);
    });

    it("returns empty result when API returns undefined", async () => {
      mockFetchPlaybackUrl.mockResolvedValueOnce(undefined);

      const result = await getAndroidUrl("user1", "token1", "pid1", 4);
      expect(result).toEqual({ url: "", rateType: 0, content: null });
    });

    it("retries with lower quality on TIPS_NEED_MEMBER", async () => {
      mockFetchPlaybackUrl
        .mockResolvedValueOnce({
          rid: "TIPS_NEED_MEMBER",
          body: { urlInfo: { rateType: "5" } },
        })
        .mockResolvedValueOnce({
          body: {
            urlInfo: {
              url: "http://play.example.com/live?puData=abc",
              rateType: "4",
            },
            content: { contId: "pid1" },
          },
        });

      const result = await getAndroidUrl("user1", "token1", "pid1", 8);

      expect(mockFetchPlaybackUrl).toHaveBeenCalledTimes(2);
      expect(result.url).toContain("&ddCalcu=mocked");
    });

    it("retries twice on double TIPS_NEED_MEMBER", async () => {
      mockFetchPlaybackUrl
        .mockResolvedValueOnce({
          rid: "TIPS_NEED_MEMBER",
          body: { urlInfo: { rateType: "5" } },
        })
        .mockResolvedValueOnce({
          rid: "TIPS_NEED_MEMBER",
          body: { urlInfo: {} },
        })
        .mockResolvedValueOnce({
          body: {
            urlInfo: {
              url: "http://play.example.com/live?puData=abc",
              rateType: "3",
            },
            content: { contId: "pid1" },
          },
        });

      const result = await getAndroidUrl("user1", "token1", "pid1", 8);
      expect(mockFetchPlaybackUrl).toHaveBeenCalledTimes(3);
      expect(result.rateType).toBe(3);
    });
  });

  describe("getAndroidUrl720p", () => {
    it("returns encrypted URL on success", async () => {
      mockFetchPlaybackUrl720p.mockResolvedValueOnce({
        body: {
          urlInfo: {
            url: "http://play.example.com/live?puData=abc",
            rateType: "3",
          },
          content: { contId: "pid1" },
        },
      });

      const result = await getAndroidUrl720p("pid1");

      expect(result.url).toContain("&ddCalcu=mocked720p");
      expect(result.rateType).toBe(3);
    });

    it("returns empty URL when urlInfo is missing", async () => {
      mockFetchPlaybackUrl720p.mockResolvedValueOnce({
        body: { urlInfo: {} },
      });

      const result = await getAndroidUrl720p("pid1");
      expect(result.url).toBe("");
    });

    it("returns empty result when API returns undefined", async () => {
      mockFetchPlaybackUrl720p.mockResolvedValueOnce(undefined);

      const result = await getAndroidUrl720p("pid1");
      expect(result).toEqual({ url: "", rateType: 0, content: null });
    });
  });

  describe("resolveRedirectUrl", () => {
    it("follows 302 redirect and returns Location", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        headers: new Headers({
          Location: "http://final.example.com/stream.m3u8",
        }),
      } as Response);

      const result = await resolveRedirectUrl({
        url: "http://redir.example.com",
        rateType: 3,
        content: null,
      });
      expect(result).toBe("http://final.example.com/stream.m3u8");
    });

    it("skips bofang URLs", async () => {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce({
          headers: new Headers({
            Location: "http://bofang.example.com/stream",
          }),
        } as Response)
        .mockResolvedValueOnce({
          headers: new Headers({ Location: "http://good.example.com/stream" }),
        } as Response);

      const result = await resolveRedirectUrl({
        url: "http://redir.example.com",
        rateType: 3,
        content: null,
      });
      expect(result).toBe("http://good.example.com/stream");
    });

    it("returns empty string after max retries", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        headers: new Headers({}),
      } as Response);

      const result = await resolveRedirectUrl({
        url: "http://redir.example.com",
        rateType: 3,
        content: null,
      });
      expect(result).toBe("");
    });

    it("handles fetch errors gracefully", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fail"));

      const result = await resolveRedirectUrl({
        url: "http://redir.example.com",
        rateType: 3,
        content: null,
      });
      expect(result).toBe("");
    });
  });

  describe("printLoginInfo", () => {
    it("prints login success when authenticated", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      printLoginInfo({
        url: "",
        rateType: 0,
        content: {
          body: {
            auth: { logined: true, authResult: "OK" },
          },
        },
      });
      expect(spy).toHaveBeenCalled();
    });

    it("prints auth failed message", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      printLoginInfo({
        url: "",
        rateType: 0,
        content: {
          body: {
            auth: {
              logined: true,
              authResult: "FAIL",
              resultDesc: "VIP required",
            },
          },
        },
      });
      expect(spy).toHaveBeenCalled();
    });

    it("prints not logged in when auth is missing", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      printLoginInfo({
        url: "",
        rateType: 0,
        content: { body: {} },
      });
      expect(spy).toHaveBeenCalled();
    });

    it("handles null content gracefully", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      printLoginInfo({ url: "", rateType: 0, content: null });
      expect(spy).toHaveBeenCalled();
    });
  });
});
