import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/utils/net.js", () => ({
  fetchUrl: vi.fn(),
}));

import { fetchUrl } from "../../src/utils/net.js";
import { cateList, dataList, delay } from "../../src/utils/fetchList.js";

const mockFetchUrl = vi.mocked(fetchUrl);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchList", () => {
  describe("delay", () => {
    it("resolves after specified milliseconds", async () => {
      vi.useFakeTimers();
      const promise = delay(100);
      vi.advanceTimersByTime(100);
      await promise;
      vi.useRealTimers();
    });
  });

  describe("cateList", () => {
    it("returns sorted and filtered live list", async () => {
      mockFetchUrl.mockResolvedValueOnce({
        body: {
          liveList: [
            { name: "地方", vomsID: "v3", dataList: [] },
            { name: "热门", vomsID: "v1", dataList: [] },
            { name: "央视", vomsID: "v2", dataList: [] },
          ],
        },
      });

      const result = await cateList();

      expect(result).toHaveLength(2);
      expect(result[0]!.name).toBe("央视");
      expect(result[1]!.name).toBe("地方");
    });

    it("filters out 热门 category", async () => {
      mockFetchUrl.mockResolvedValueOnce({
        body: {
          liveList: [
            { name: "热门", vomsID: "v1", dataList: [] },
            { name: "央视", vomsID: "v2", dataList: [] },
          ],
        },
      });

      const result = await cateList();
      expect(result.every((item) => item.name !== "热门")).toBe(true);
    });
  });

  describe("dataList", () => {
    it("fetches detailed data for each category", async () => {
      mockFetchUrl
        .mockResolvedValueOnce({
          body: {
            liveList: [
              { name: "央视", vomsID: "v1", dataList: [] },
            ],
          },
        })
        .mockResolvedValueOnce({
          body: {
            dataList: [
              { name: "CCTV1", pID: "001", pics: { highResolutionH: "" } },
            ],
          },
        });

      const result = await dataList();

      expect(result).toHaveLength(1);
      expect(result[0]!.dataList).toHaveLength(1);
      expect(result[0]!.dataList[0]!.name).toBe("CCTV1");
    });

    it("handles fetch errors for individual categories", async () => {
      mockFetchUrl
        .mockResolvedValueOnce({
          body: {
            liveList: [
              { name: "央视", vomsID: "v1", dataList: [] },
            ],
          },
        })
        .mockRejectedValueOnce(new Error("network error"));

      const result = await dataList();

      expect(result).toHaveLength(1);
      expect(result[0]!.dataList).toEqual([]);
    });

    it("deduplicates channels across categories", async () => {
      mockFetchUrl
        .mockResolvedValueOnce({
          body: {
            liveList: [
              { name: "央视", vomsID: "v1", dataList: [] },
              { name: "地方", vomsID: "v2", dataList: [] },
            ],
          },
        })
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

      const result = await dataList();

      const allNames = result.flatMap((cat) => cat.dataList.map((ch) => ch.name));
      expect(new Set(allNames).size).toBe(allNames.length);
    });
  });
});
