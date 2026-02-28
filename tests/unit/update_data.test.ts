import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/config.js", () => ({
  host: "http://test.local",
  token: "testToken",
  userId: "testUser",
  debug: false,
  logLevel: "info",
  logFile: undefined,
}));

vi.mock("../../src/utils/time.js", () => ({
  getDateString: vi.fn(() => "20260228"),
  getLogDateTime: vi.fn(() => "2026-01-01 00:00:00:000"),
}));

vi.mock("../../src/utils/channel_list.js", () => ({
  fetchCategoryChannels: vi.fn(),
}));

vi.mock("../../src/utils/file_util.js", () => ({
  writeFile: vi.fn(),
  appendFile: vi.fn(),
  appendFileSync: vi.fn(),
  copyFileSync: vi.fn(),
  renameFileSync: vi.fn(),
}));

vi.mock("../../src/utils/epg.js", () => ({
  updateEpgData: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("../../src/utils/refresh_token.js", () => ({
  default: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("../../src/api/migu_client.js", () => ({
  fetchMatchList: vi.fn(),
  fetchMatchBasicData: vi.fn(),
  fetchMatchReplayList: vi.fn(),
}));

import { fetchCategoryChannels } from "../../src/utils/channel_list.js";
import {
  fetchMatchList,
  fetchMatchBasicData,
  fetchMatchReplayList,
} from "../../src/api/migu_client.js";
import { renameFileSync } from "../../src/utils/file_util.js";
import refreshToken from "../../src/utils/refresh_token.js";
import { updatePlaylistData } from "../../src/utils/update_data.js";

const mockDataList = vi.mocked(fetchCategoryChannels);
const mockFetchMatchList = vi.mocked(fetchMatchList);
const mockFetchMatchBasicData = vi.mocked(fetchMatchBasicData);
const mockFetchMatchReplayList = vi.mocked(fetchMatchReplayList);
const mockRenameFileSync = vi.mocked(renameFileSync);
const mockRefreshToken = vi.mocked(refreshToken);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("update_data", () => {
  describe("updatePlaylistData", () => {
    it("runs full update cycle (TV + PE)", async () => {
      mockDataList.mockResolvedValue([
        {
          name: "央视",
          vomsId: "v1",
          dataList: [
            { name: "CCTV1", pid: "001", pics: { highResolutionH: "" } },
          ],
        },
      ]);

      mockFetchMatchList.mockResolvedValue({
        body: {
          days: ["20260227", "20260228", "20260301", "20260302"],
          matchList: {},
        },
      });

      await updatePlaylistData(6);

      expect(mockDataList).toHaveBeenCalledTimes(1);
      expect(mockRenameFileSync).toHaveBeenCalled();
    });

    it("refreshes token when hours is multiple of 720", async () => {
      mockDataList.mockResolvedValue([
        { name: "央视", vomsId: "v1", dataList: [] },
      ]);

      mockFetchMatchList.mockResolvedValue({
        body: { days: [], matchList: {} },
      });

      await updatePlaylistData(720);

      expect(mockRefreshToken).toHaveBeenCalledWith("testUser", "testToken");
    });

    it("does not refresh token for non-720 multiples", async () => {
      mockDataList.mockResolvedValue([
        { name: "央视", vomsId: "v1", dataList: [] },
      ]);

      mockFetchMatchList.mockResolvedValue({
        body: { days: [], matchList: {} },
      });

      await updatePlaylistData(6);

      expect(mockRefreshToken).not.toHaveBeenCalled();
    });

    it("skips PE update when match list returns undefined", async () => {
      mockDataList.mockResolvedValue([
        { name: "央视", vomsId: "v1", dataList: [] },
      ]);

      mockFetchMatchList.mockResolvedValue(undefined);

      await updatePlaylistData(6);

      expect(mockFetchMatchBasicData).not.toHaveBeenCalled();
    });

    it("handles PE match data with live events", async () => {
      mockDataList.mockResolvedValue([
        { name: "央视", vomsId: "v1", dataList: [] },
      ]);

      mockFetchMatchList.mockResolvedValueOnce({
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
      });

      mockFetchMatchBasicData.mockResolvedValueOnce({
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

      await updatePlaylistData(6);

      expect(mockFetchMatchBasicData).toHaveBeenCalledWith("match1");
    });

    it("handles PE replay data for finished matches", async () => {
      mockDataList.mockResolvedValue([
        { name: "央视", vomsId: "v1", dataList: [] },
      ]);

      mockFetchMatchList.mockResolvedValueOnce({
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
      });

      mockFetchMatchBasicData.mockResolvedValueOnce({
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
      });

      mockFetchMatchReplayList.mockResolvedValueOnce({
        body: {
          replayList: [{ name: "全场回放", pID: "replay003" }],
        },
      });

      await updatePlaylistData(6);

      expect(mockFetchMatchBasicData).toHaveBeenCalledWith("match2");
      expect(mockFetchMatchReplayList).toHaveBeenCalledWith("match2");
    });
  });
});
