import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/api/migu_client.js", () => ({
  fetchLiveCategories: vi.fn(),
  fetchCategoryDetail: vi.fn(),
}));

vi.mock("../../src/config.js", () => ({
  debug: false,
  logLevel: "info",
  logFile: undefined,
}));

vi.mock("../../src/utils/time.js", () => ({
  getLogDateTime: vi.fn(() => "2026-01-01 00:00:00:000"),
}));

import {
  fetchLiveCategories,
  fetchCategoryDetail,
} from "../../src/api/migu_client.js";
import {
  fetchCategories,
  fetchCategoryChannels,
  delay,
} from "../../src/utils/channel_list.js";

const mockFetchLiveCategories = vi.mocked(fetchLiveCategories);
const mockFetchCategoryDetail = vi.mocked(fetchCategoryDetail);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("channel_list", () => {
  describe("delay", () => {
    it("resolves after specified milliseconds", async () => {
      vi.useFakeTimers();
      const promise = delay(100);
      vi.advanceTimersByTime(100);
      await promise;
      vi.useRealTimers();
    });
  });

  describe("fetchCategories", () => {
    it("returns sorted and filtered live list", async () => {
      mockFetchLiveCategories.mockResolvedValueOnce({
        body: {
          liveList: [
            { name: "地方", vomsID: "v3", dataList: [] },
            { name: "热门", vomsID: "v1", dataList: [] },
            { name: "央视", vomsID: "v2", dataList: [] },
          ],
        },
      });

      const result = await fetchCategories();

      expect(result).toHaveLength(2);
      expect(result[0]!.name).toBe("央视");
      expect(result[1]!.name).toBe("地方");
    });

    it("filters out 热门 category", async () => {
      mockFetchLiveCategories.mockResolvedValueOnce({
        body: {
          liveList: [
            { name: "热门", vomsID: "v1", dataList: [] },
            { name: "央视", vomsID: "v2", dataList: [] },
          ],
        },
      });

      const result = await fetchCategories();
      expect(result.every((item) => item.name !== "热门")).toBe(true);
    });

    it("returns empty list when API returns undefined", async () => {
      mockFetchLiveCategories.mockResolvedValueOnce(undefined);

      const result = await fetchCategories();
      expect(result).toEqual([]);
    });
  });

  describe("fetchCategoryChannels", () => {
    it("fetches detailed data for each category", async () => {
      mockFetchLiveCategories.mockResolvedValueOnce({
        body: {
          liveList: [{ name: "央视", vomsID: "v1", dataList: [] }],
        },
      });
      mockFetchCategoryDetail.mockResolvedValueOnce({
        body: {
          dataList: [
            { name: "CCTV1", pID: "001", pics: { highResolutionH: "" } },
          ],
        },
      });

      const result = await fetchCategoryChannels();

      expect(result).toHaveLength(1);
      expect(result[0]!.dataList).toHaveLength(1);
      expect(result[0]!.dataList[0]!.name).toBe("CCTV1");
    });

    it("handles fetch errors for individual categories", async () => {
      mockFetchLiveCategories.mockResolvedValueOnce({
        body: {
          liveList: [{ name: "央视", vomsID: "v1", dataList: [] }],
        },
      });
      mockFetchCategoryDetail.mockRejectedValueOnce(new Error("network error"));

      const result = await fetchCategoryChannels();

      expect(result).toHaveLength(1);
      expect(result[0]!.dataList).toEqual([]);
    });

    it("handles undefined API response for category detail", async () => {
      mockFetchLiveCategories.mockResolvedValueOnce({
        body: {
          liveList: [{ name: "央视", vomsID: "v1", dataList: [] }],
        },
      });
      mockFetchCategoryDetail.mockResolvedValueOnce(undefined);

      const result = await fetchCategoryChannels();

      expect(result).toHaveLength(1);
      expect(result[0]!.dataList).toEqual([]);
    });

    it("deduplicates channels across categories", async () => {
      mockFetchLiveCategories.mockResolvedValueOnce({
        body: {
          liveList: [
            { name: "央视", vomsID: "v1", dataList: [] },
            { name: "地方", vomsID: "v2", dataList: [] },
          ],
        },
      });
      mockFetchCategoryDetail
        .mockResolvedValueOnce({
          body: {
            dataList: [
              { name: "CCTV1", pID: "001", pics: { highResolutionH: "" } },
            ],
          },
        })
        .mockResolvedValueOnce({
          body: {
            dataList: [
              { name: "CCTV1", pID: "001", pics: { highResolutionH: "" } },
              { name: "Local1", pID: "002", pics: { highResolutionH: "" } },
            ],
          },
        });

      const result = await fetchCategoryChannels();

      const allNames = result.flatMap((cat) =>
        cat.dataList.map((ch) => ch.name),
      );
      expect(new Set(allNames).size).toBe(allNames.length);
    });
  });
});
