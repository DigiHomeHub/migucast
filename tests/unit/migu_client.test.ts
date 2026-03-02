import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/config.js", () => ({
  logLevel: "info",
  logFile: undefined,
}));

vi.mock("../../src/utils/net.js", () => ({
  fetchUrl: vi.fn(),
}));

vi.mock("../../src/utils/crypto_utils.js", () => ({
  getStringMd5: vi.fn((str: string) => `md5_${str.slice(0, 8)}`),
  aesEncrypt: vi.fn((data: string) => `encrypted_${data.slice(0, 8)}`),
  rsaSign: vi.fn((data: string) => `signed_${data}`),
}));

import { fetchUrl } from "../../src/utils/net.js";
import {
  fetchLiveCategories,
  fetchCategoryDetail,
  fetchPlaybackUrl,
  fetchPlaybackUrl720p,
  fetchMiguEpg,
  fetchMatchList,
  fetchMatchBasicData,
  fetchMatchReplayList,
  refreshMiguToken,
} from "../../src/api/migu_client.js";

const mockFetchUrl = vi.mocked(fetchUrl);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("migu_client", () => {
  // -----------------------------------------------------------------------
  // validateOrFallback (tested indirectly through every fetch function)
  // -----------------------------------------------------------------------

  describe("validateOrFallback behavior", () => {
    it("returns undefined when fetchUrl returns undefined", async () => {
      mockFetchUrl.mockResolvedValueOnce(undefined);
      const result = await fetchLiveCategories();
      expect(result).toBeUndefined();
    });

    it("returns validated data when schema passes", async () => {
      const validData = {
        body: {
          liveList: [
            {
              name: "CCTV",
              vomsID: "abc",
              dataList: [
                {
                  pID: "1",
                  name: "CCTV-1",
                  pics: { highResolutionH: "http://img" },
                },
              ],
            },
          ],
        },
      };
      mockFetchUrl.mockResolvedValueOnce(validData);
      const result = await fetchLiveCategories();
      expect(result).toEqual(validData);
    });

    it("falls back to raw data when schema validation fails", async () => {
      const invalidData = { body: { liveList: "not-an-array" } };
      mockFetchUrl.mockResolvedValueOnce(invalidData);
      const result = await fetchLiveCategories();
      expect(result).toEqual(invalidData);
    });
  });

  // -----------------------------------------------------------------------
  // fetchLiveCategories
  // -----------------------------------------------------------------------

  describe("fetchLiveCategories", () => {
    it("calls fetchUrl with correct URL and default timeout", async () => {
      mockFetchUrl.mockResolvedValueOnce(undefined);
      await fetchLiveCategories();
      expect(mockFetchUrl).toHaveBeenCalledWith(
        expect.stringContaining(
          "program-sc.miguvideo.com/live/v2/tv-data/1ff892f2b5ab4a79be6e25b69d2f5d05",
        ),
        {},
        6000,
      );
    });

    it("passes custom timeout", async () => {
      mockFetchUrl.mockResolvedValueOnce(undefined);
      await fetchLiveCategories(3000);
      expect(mockFetchUrl).toHaveBeenCalledWith(expect.any(String), {}, 3000);
    });
  });

  // -----------------------------------------------------------------------
  // fetchCategoryDetail
  // -----------------------------------------------------------------------

  describe("fetchCategoryDetail", () => {
    it("calls fetchUrl with correct vomsId in URL", async () => {
      mockFetchUrl.mockResolvedValueOnce(undefined);
      await fetchCategoryDetail("test-voms-id");
      expect(mockFetchUrl).toHaveBeenCalledWith(
        expect.stringContaining("/live/v2/tv-data/test-voms-id"),
        {},
        6000,
      );
    });

    it("returns validated category detail", async () => {
      const data = {
        body: {
          dataList: [
            {
              pID: "1",
              name: "CH",
              pics: { highResolutionH: "http://img" },
            },
          ],
        },
      };
      mockFetchUrl.mockResolvedValueOnce(data);
      const result = await fetchCategoryDetail("vid");
      expect(result).toEqual(data);
    });
  });

  // -----------------------------------------------------------------------
  // fetchPlaybackUrl
  // -----------------------------------------------------------------------

  describe("fetchPlaybackUrl", () => {
    it("constructs URL with sign, rateType, contId, timestamp, salt", async () => {
      mockFetchUrl.mockResolvedValueOnce(undefined);
      await fetchPlaybackUrl("pid123", 3);
      const url = mockFetchUrl.mock.calls[0]![0];
      expect(url).toContain("play.miguvideo.com/playurl/v1/play/playurl");
      expect(url).toContain("sign=");
      expect(url).toContain("rateType=3");
      expect(url).toContain("contId=pid123");
      expect(url).toContain("timestamp=");
      expect(url).toContain("salt=");
    });

    it("includes auth headers when rateType != 2 and userId/token provided", async () => {
      mockFetchUrl.mockResolvedValueOnce(undefined);
      await fetchPlaybackUrl("pid123", 3, {
        userId: "user1",
        token: "tok1",
      });
      const opts = mockFetchUrl.mock.calls[0]![1] as {
        headers: Record<string, string>;
      };
      expect(opts.headers.UserId).toBe("user1");
      expect(opts.headers.UserToken).toBe("tok1");
    });

    it("omits auth headers when rateType is 2", async () => {
      mockFetchUrl.mockResolvedValueOnce(undefined);
      await fetchPlaybackUrl("pid123", 2, {
        userId: "user1",
        token: "tok1",
      });
      const opts = mockFetchUrl.mock.calls[0]![1] as {
        headers: Record<string, string>;
      };
      expect(opts.headers.UserId).toBeUndefined();
      expect(opts.headers.UserToken).toBeUndefined();
    });

    it("skips appCode for excluded pids (641886683)", async () => {
      mockFetchUrl.mockResolvedValueOnce(undefined);
      await fetchPlaybackUrl("641886683", 3);
      const opts = mockFetchUrl.mock.calls[0]![1] as {
        headers: Record<string, string>;
      };
      expect(opts.headers.appCode).toBeUndefined();
    });

    it("skips appCode for excluded pids (641886773)", async () => {
      mockFetchUrl.mockResolvedValueOnce(undefined);
      await fetchPlaybackUrl("641886773", 3);
      const opts = mockFetchUrl.mock.calls[0]![1] as {
        headers: Record<string, string>;
      };
      expect(opts.headers.appCode).toBeUndefined();
    });

    it("includes appCode for normal pids", async () => {
      mockFetchUrl.mockResolvedValueOnce(undefined);
      await fetchPlaybackUrl("pid999", 3);
      const opts = mockFetchUrl.mock.calls[0]![1] as {
        headers: Record<string, string>;
      };
      expect(opts.headers.appCode).toBe("miguvideo_default_android");
    });

    it("adds HDR params when enableHdr is true", async () => {
      mockFetchUrl.mockResolvedValueOnce(undefined);
      await fetchPlaybackUrl("pid123", 3, { enableHdr: true });
      const url = mockFetchUrl.mock.calls[0]![0];
      expect(url).toContain("4kvivid=true");
      expect(url).toContain("2Kvivid=true");
      expect(url).toContain("vivid=2");
    });

    it("adds H265 params when enableH265 is true", async () => {
      mockFetchUrl.mockResolvedValueOnce(undefined);
      await fetchPlaybackUrl("pid123", 3, { enableH265: true });
      const url = mockFetchUrl.mock.calls[0]![0];
      expect(url).toContain("h265N=true");
    });

    it("adds ott param when rateType is 9", async () => {
      mockFetchUrl.mockResolvedValueOnce(undefined);
      await fetchPlaybackUrl("pid123", 9);
      const url = mockFetchUrl.mock.calls[0]![0];
      expect(url).toContain("ott=true");
    });

    it("does not add ott param for other rateTypes", async () => {
      mockFetchUrl.mockResolvedValueOnce(undefined);
      await fetchPlaybackUrl("pid123", 3);
      const url = mockFetchUrl.mock.calls[0]![0];
      expect(url).not.toContain("ott=true");
    });
  });

  // -----------------------------------------------------------------------
  // fetchPlaybackUrl720p
  // -----------------------------------------------------------------------

  describe("fetchPlaybackUrl720p", () => {
    it("constructs URL with rateType=3 fixed", async () => {
      mockFetchUrl.mockResolvedValueOnce(undefined);
      await fetchPlaybackUrl720p("pid123");
      const url = mockFetchUrl.mock.calls[0]![0];
      expect(url).toContain("rateType=3");
    });

    it("uses provided persistentClientId in headers", async () => {
      mockFetchUrl.mockResolvedValueOnce(undefined);
      await fetchPlaybackUrl720p("pid123", "my-client-id");
      const opts = mockFetchUrl.mock.calls[0]![1] as {
        headers: Record<string, string>;
      };
      expect(opts.headers.ClientId).toBe("my-client-id");
    });

    it("generates clientId when persistentClientId is not provided", async () => {
      mockFetchUrl.mockResolvedValueOnce(undefined);
      await fetchPlaybackUrl720p("pid123");
      const opts = mockFetchUrl.mock.calls[0]![1] as {
        headers: Record<string, string>;
      };
      expect(opts.headers.ClientId).toBeDefined();
      expect(opts.headers.ClientId!.length).toBeGreaterThan(0);
    });

    it("skips appCode for excluded pids", async () => {
      mockFetchUrl.mockResolvedValueOnce(undefined);
      await fetchPlaybackUrl720p("641886683");
      const opts = mockFetchUrl.mock.calls[0]![1] as {
        headers: Record<string, string>;
      };
      expect(opts.headers.appCode).toBeUndefined();
    });

    it("includes HDR and H265 params", async () => {
      mockFetchUrl.mockResolvedValueOnce(undefined);
      await fetchPlaybackUrl720p("pid123", undefined, {
        enableHdr: true,
        enableH265: true,
      });
      const url = mockFetchUrl.mock.calls[0]![0];
      expect(url).toContain("4kvivid=true");
      expect(url).toContain("h265N=true");
    });
  });

  // -----------------------------------------------------------------------
  // fetchMiguEpg
  // -----------------------------------------------------------------------

  describe("fetchMiguEpg", () => {
    it("calls fetchUrl with programId and dateStr in URL", async () => {
      mockFetchUrl.mockResolvedValueOnce(undefined);
      await fetchMiguEpg("prog123", "20260301");
      expect(mockFetchUrl).toHaveBeenCalledWith(
        expect.stringContaining("/live/v2/tv-programs-data/prog123/20260301"),
        {},
        6000,
      );
    });
  });

  // -----------------------------------------------------------------------
  // fetchMatchList
  // -----------------------------------------------------------------------

  describe("fetchMatchList", () => {
    it("calls fetchUrl with correct match list URL", async () => {
      mockFetchUrl.mockResolvedValueOnce(undefined);
      await fetchMatchList();
      expect(mockFetchUrl).toHaveBeenCalledWith(
        expect.stringContaining(
          "v0-sc.miguvideo.com/vms-match/v6/staticcache/basic/match-list",
        ),
        {},
        6000,
      );
    });
  });

  // -----------------------------------------------------------------------
  // fetchMatchBasicData
  // -----------------------------------------------------------------------

  describe("fetchMatchBasicData", () => {
    it("calls fetchUrl with mgdbId in URL", async () => {
      mockFetchUrl.mockResolvedValueOnce(undefined);
      await fetchMatchBasicData("mgdb789");
      expect(mockFetchUrl).toHaveBeenCalledWith(
        expect.stringContaining("/basic-data/mgdb789/miguvideo"),
        {},
        6000,
      );
    });
  });

  // -----------------------------------------------------------------------
  // fetchMatchReplayList
  // -----------------------------------------------------------------------

  describe("fetchMatchReplayList", () => {
    it("calls fetchUrl with mgdbId in URL", async () => {
      mockFetchUrl.mockResolvedValueOnce(undefined);
      await fetchMatchReplayList("mgdb456");
      expect(mockFetchUrl).toHaveBeenCalledWith(
        expect.stringContaining("/all-view-list/mgdb456/2/miguvideo"),
        {},
        6000,
      );
    });
  });

  // -----------------------------------------------------------------------
  // refreshMiguToken
  // -----------------------------------------------------------------------

  describe("refreshMiguToken", () => {
    it("calls fetchUrl with POST method and encrypted body", async () => {
      mockFetchUrl.mockResolvedValueOnce(undefined);
      await refreshMiguToken("user1", "token1");
      const [url, opts] = mockFetchUrl.mock.calls[0]!;
      expect(url).toContain(
        "migu-app-umnb.miguvideo.com/login/token_refresh_migu_plus",
      );
      expect(url).toContain("sign=");
      expect(url).toContain("signType=RSA");
      expect((opts as { method: string }).method).toBe("post");
      expect((opts as { body: string }).body).toContain("encrypted_");
    });

    it("includes userId and userToken in request headers", async () => {
      mockFetchUrl.mockResolvedValueOnce(undefined);
      await refreshMiguToken("user42", "tok42");
      const opts = mockFetchUrl.mock.calls[0]![1] as {
        headers: Record<string, string>;
      };
      expect(opts.headers.userId).toBe("user42");
      expect(opts.headers.userToken).toBe("tok42");
      expect(opts.headers["Content-Type"]).toContain("application/json");
    });

    it("returns validated token response", async () => {
      const data = { resultCode: "REFRESH_TOKEN_SUCCESS" };
      mockFetchUrl.mockResolvedValueOnce(data);
      const result = await refreshMiguToken("u", "t");
      expect(result).toEqual(data);
    });
  });
});
