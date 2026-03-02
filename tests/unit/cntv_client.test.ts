import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/config.js", () => ({
  logLevel: "info",
  logFile: undefined,
}));

vi.mock("../../src/utils/net.js", () => ({
  fetchUrl: vi.fn(),
}));

import { fetchUrl } from "../../src/utils/net.js";
import { fetchCntvEpg } from "../../src/api/cntv_client.js";

const mockFetchUrl = vi.mocked(fetchUrl);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cntv_client", () => {
  describe("fetchCntvEpg", () => {
    it("calls fetchUrl with correct URL containing cntvName and dateStr", async () => {
      mockFetchUrl.mockResolvedValueOnce(undefined);
      await fetchCntvEpg("cctv1", "20260301");
      expect(mockFetchUrl).toHaveBeenCalledWith(
        "https://api.cntv.cn/epg/epginfo3?serviceId=shiyi&d=20260301&c=cctv1",
        {},
        6000,
      );
    });

    it("passes custom timeout", async () => {
      mockFetchUrl.mockResolvedValueOnce(undefined);
      await fetchCntvEpg("cctv2", "20260301", 3000);
      expect(mockFetchUrl).toHaveBeenCalledWith(expect.any(String), {}, 3000);
    });

    it("returns undefined when fetchUrl returns undefined", async () => {
      mockFetchUrl.mockResolvedValueOnce(undefined);
      const result = await fetchCntvEpg("cctv1", "20260301");
      expect(result).toBeUndefined();
    });

    it("returns validated data for valid response", async () => {
      const validData = {
        cctv1: {
          program: [{ t: "News", st: 1000, et: 2000 }],
        },
      };
      mockFetchUrl.mockResolvedValueOnce(validData);
      const result = await fetchCntvEpg("cctv1", "20260301");
      expect(result).toEqual(validData);
    });

    it("falls back to raw data when schema validation fails", async () => {
      const invalidData = { cctv1: { program: "not-an-array" } };
      mockFetchUrl.mockResolvedValueOnce(invalidData);
      const result = await fetchCntvEpg("cctv1", "20260301");
      expect(result).toEqual(invalidData);
    });

    it("handles response with nullish program field", async () => {
      const data = { cctv1: { program: null } };
      mockFetchUrl.mockResolvedValueOnce(data);
      const result = await fetchCntvEpg("cctv1", "20260301");
      expect(result).toEqual(data);
    });
  });
});
