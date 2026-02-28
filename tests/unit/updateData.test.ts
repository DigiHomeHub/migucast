import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/config.js", () => ({
  host: "http://test.local",
  token: "testToken",
  userId: "testUser",
  debug: false,
}));

vi.mock("../../src/utils/time.js", () => ({
  getDateString: vi.fn(() => "20260228"),
  getLogDateTime: vi.fn(() => "2026-01-01 00:00:00:000"),
}));

vi.mock("../../src/utils/fetchList.js", () => ({
  dataList: vi.fn(),
}));

vi.mock("../../src/utils/fileUtil.js", () => ({
  writeFile: vi.fn(),
  appendFile: vi.fn(),
  appendFileSync: vi.fn(),
  copyFileSync: vi.fn(),
  renameFileSync: vi.fn(),
}));

vi.mock("../../src/utils/epg.js", () => ({
  updateEpgData: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("../../src/utils/refreshToken.js", () => ({
  default: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("../../src/utils/net.js", () => ({
  fetchUrl: vi.fn(),
}));

import { dataList } from "../../src/utils/fetchList.js";
import { fetchUrl } from "../../src/utils/net.js";
import { renameFileSync } from "../../src/utils/fileUtil.js";
import refreshToken from "../../src/utils/refreshToken.js";
import update from "../../src/utils/updateData.js";

const mockDataList = vi.mocked(dataList);
const mockFetchUrl = vi.mocked(fetchUrl);
const mockRenameFileSync = vi.mocked(renameFileSync);
const mockRefreshToken = vi.mocked(refreshToken);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateData", () => {
  describe("update", () => {
    it("runs full update cycle (TV + PE)", async () => {
      mockDataList.mockResolvedValue([
        {
          name: "央视",
          vomsID: "v1",
          dataList: [
            { name: "CCTV1", pID: "001", pics: { highResolutionH: "" } },
          ],
        },
      ]);

      mockFetchUrl.mockResolvedValue({
        body: {
          days: ["20260227", "20260228", "20260301", "20260302"],
          matchList: {},
        },
      });

      await update(6);

      expect(mockDataList).toHaveBeenCalledTimes(1);
      expect(mockRenameFileSync).toHaveBeenCalled();
    });

    it("refreshes token when hours is multiple of 720", async () => {
      mockDataList.mockResolvedValue([
        { name: "央视", vomsID: "v1", dataList: [] },
      ]);

      mockFetchUrl.mockResolvedValue({
        body: { days: [], matchList: {} },
      });

      await update(720);

      expect(mockRefreshToken).toHaveBeenCalledWith("testUser", "testToken");
    });

    it("does not refresh token for non-720 multiples", async () => {
      mockDataList.mockResolvedValue([
        { name: "央视", vomsID: "v1", dataList: [] },
      ]);

      mockFetchUrl.mockResolvedValue({
        body: { days: [], matchList: {} },
      });

      await update(6);

      expect(mockRefreshToken).not.toHaveBeenCalled();
    });

    it("handles PE match data with live events", async () => {
      mockDataList.mockResolvedValue([
        { name: "央视", vomsID: "v1", dataList: [] },
      ]);

      mockFetchUrl
        .mockResolvedValueOnce({
          body: {
            days: ["20260227", "20260228", "20260301", "20260302"],
            matchList: {
              "20260228": [
                {
                  mgdbId: "match1",
                  pkInfoTitle: "TeamA vs TeamB",
                  competitionName: "League",
                  competitionLogo: "logo.png",
                },
              ],
            },
          },
        })
        .mockResolvedValueOnce({
          body: {
            endTime: Date.now() + 100000,
            multiPlayList: {
              liveList: [
                {
                  name: "Main feed",
                  pID: "live001",
                  startTimeStr: "2026-02-28 20:00",
                },
              ],
            },
          },
        });

      await update(6);

      expect(mockFetchUrl).toHaveBeenCalled();
    });

    it("handles PE replay data for finished matches", async () => {
      mockDataList.mockResolvedValue([
        { name: "央视", vomsID: "v1", dataList: [] },
      ]);

      mockFetchUrl
        .mockResolvedValueOnce({
          body: {
            days: ["20260227", "20260228", "20260301", "20260302"],
            matchList: {
              "20260228": [
                {
                  mgdbId: "match2",
                  pkInfoTitle: "TeamC vs TeamD",
                  competitionName: "Cup",
                  competitionLogo: "logo2.png",
                },
              ],
            },
          },
        })
        .mockResolvedValueOnce({
          body: {
            endTime: 0,
            keyword: "2026年02月28日 赛事",
            multiPlayList: {
              replayList: [
                { name: "全场回放", pID: "replay001" },
                { name: "精彩集锦", pID: "replay002" },
              ],
            },
          },
        })
        .mockResolvedValueOnce({
          body: {
            replayList: [{ name: "全场回放", pID: "replay003" }],
          },
        });

      await update(6);

      expect(mockFetchUrl).toHaveBeenCalled();
    });
  });
});
