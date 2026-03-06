import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/config.js", () => ({
  host: "http://test.local",
  token: "testToken",
  userId: "testUser",
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

vi.mock("../../src/utils/time.js", () => ({
  getDateString: vi.fn(() => "20260228"),
  getCompactDateTime: vi.fn((date: Date) => {
    const pad = (n: number) => n.toString().padStart(2, "0");
    return (
      date.getUTCFullYear().toString() +
      pad(date.getUTCMonth() + 1) +
      pad(date.getUTCDate()) +
      pad(date.getUTCHours()) +
      pad(date.getUTCMinutes()) +
      pad(date.getUTCSeconds())
    );
  }),
}));

vi.mock("../../src/utils/channel_list.js", () => ({
  fetchCategoryChannels: vi.fn(),
}));

const mockStorage = {
  get: vi
    .fn<(key: string) => Promise<string | null>>()
    .mockImplementation((key: string) =>
      Promise.resolve(storageState.get(key) ?? null),
    ),
  put: vi
    .fn<(key: string, value: string) => Promise<void>>()
    .mockImplementation((key: string, value: string) => {
      storageState.set(key, value);
      return Promise.resolve();
    }),
};
const storageState = new Map<string, string>();

vi.mock("../../src/platform/context.js", () => ({
  getStorage: () => mockStorage,
}));

vi.mock("../../src/utils/epg.js", () => ({
  buildEpgEntries: vi.fn(() => Promise.resolve(null)),
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
import refreshToken from "../../src/utils/refresh_token.js";
import { updatePlaylistData } from "../../src/utils/update_data.js";

const mockDataList = vi.mocked(fetchCategoryChannels);
const mockFetchMatchList = vi.mocked(fetchMatchList);
const mockFetchMatchBasicData = vi.mocked(fetchMatchBasicData);
const mockFetchMatchReplayList = vi.mocked(fetchMatchReplayList);
const mockRefreshToken = vi.mocked(refreshToken);

beforeEach(() => {
  vi.clearAllMocks();
  storageState.clear();
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
      expect(mockStorage.put).toHaveBeenCalled();
      const putCalls = mockStorage.put.mock.calls;
      const m3uCall = putCalls.find(
        (c: [string, string]) => c[0] === "playlist:m3u",
      );
      expect(m3uCall).toBeDefined();
      expect(m3uCall![1]).toContain("#EXTM3U");
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

    it("logs failure when token refresh fails", async () => {
      mockDataList.mockResolvedValue([
        { name: "央视", vomsId: "v1", dataList: [] },
      ]);
      mockFetchMatchList.mockResolvedValue({
        body: { days: [], matchList: {} },
      });
      mockRefreshToken.mockResolvedValueOnce(false);
      await updatePlaylistData(720);
      expect(mockRefreshToken).toHaveBeenCalled();
    });

    it("handles PE match with confrontTeams substitution", async () => {
      mockDataList.mockResolvedValue([
        { name: "央视", vomsId: "v1", dataList: [] },
      ]);
      mockFetchMatchList.mockResolvedValueOnce({
        body: {
          days: ["20260227", "20260228", "20260301", "20260302"],
          matchList: {
            "20260228": [
              {
                mgdbId: "match3",
                pkInfoTitle: "Game Title",
                competitionName: "League",
                competitionLogo: "logo.png",
                confrontTeams: [{ name: "TeamX" }, { name: "TeamY" }],
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
                name: "Main",
                pID: "live002",
                startTimeStr: "2026-02-28 20:00",
              },
            ],
          },
        },
      });
      await updatePlaylistData(6);
      expect(mockFetchMatchBasicData).toHaveBeenCalledWith("match3");
    });

    it("skips PE match when fetchMatchBasicData returns undefined", async () => {
      mockDataList.mockResolvedValue([
        { name: "央视", vomsId: "v1", dataList: [] },
      ]);
      mockFetchMatchList.mockResolvedValueOnce({
        body: {
          days: ["20260227", "20260228", "20260301", "20260302"],
          matchList: {
            "20260228": [
              {
                mgdbId: "m1",
                pkInfoTitle: "G",
                competitionName: "L",
                competitionLogo: "",
              },
            ],
          },
        },
      });
      mockFetchMatchBasicData.mockResolvedValueOnce(undefined);
      await updatePlaylistData(6);
      expect(mockFetchMatchReplayList).not.toHaveBeenCalled();
    });

    it("skips live items filtered as 集锦", async () => {
      mockDataList.mockResolvedValue([
        { name: "央视", vomsId: "v1", dataList: [] },
      ]);
      mockFetchMatchList.mockResolvedValueOnce({
        body: {
          days: ["20260227", "20260228", "20260301", "20260302"],
          matchList: {
            "20260228": [
              {
                mgdbId: "m4",
                pkInfoTitle: "G",
                competitionName: "Cup",
                competitionLogo: "",
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
              { name: "精彩集锦", pID: "l1", startTimeStr: "2026-02-28 20:00" },
              { name: null, pID: "l2", startTimeStr: "2026-02-28 20:00" },
            ],
          },
        },
      });
      await updatePlaylistData(6);
    });

    it("handles PE replay with preList startTimeStr", async () => {
      mockDataList.mockResolvedValue([
        { name: "央视", vomsId: "v1", dataList: [] },
      ]);
      mockFetchMatchList.mockResolvedValueOnce({
        body: {
          days: ["20260227", "20260228", "20260301", "20260302"],
          matchList: {
            "20260228": [
              {
                mgdbId: "m5",
                pkInfoTitle: "TeamA vs TeamB",
                competitionName: "Cup",
                competitionLogo: "l.png",
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
            replayList: [{ name: "全场回放", pID: "r1" }],
            preList: [{ startTimeStr: "2026-02-28 19:30" }],
          },
        },
      });
      mockFetchMatchReplayList.mockResolvedValueOnce({
        body: { replayList: [{ name: "全场回放", pID: "r2" }] },
      });
      await updatePlaylistData(6);
    });

    it("handles PE match processing error gracefully", async () => {
      mockDataList.mockResolvedValue([
        { name: "央视", vomsId: "v1", dataList: [] },
      ]);
      mockFetchMatchList.mockResolvedValueOnce({
        body: {
          days: ["20260227", "20260228", "20260301", "20260302"],
          matchList: {
            "20260228": [
              {
                mgdbId: "m6",
                pkInfoTitle: "G",
                competitionName: "L",
                competitionLogo: "",
              },
            ],
          },
        },
      });
      mockFetchMatchBasicData.mockResolvedValueOnce({
        body: {
          endTime: 0,
          multiPlayList: null,
        },
      });
      mockFetchMatchReplayList.mockResolvedValueOnce({
        body: { replayList: null },
      });
      await updatePlaylistData(6);
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

    it("writes sports XMLTV entries for live sports channels so tvg-id can match", async () => {
      mockDataList.mockResolvedValue([
        { name: "央视", vomsId: "v1", dataList: [] },
      ]);
      mockFetchMatchList.mockResolvedValueOnce({
        body: {
          days: ["20260227", "20260228", "20260301", "20260302"],
          matchList: {
            "20260228": [
              {
                mgdbId: "live-match-1",
                pkInfoTitle: "OriginalTitle",
                competitionName: "NBA",
                competitionLogo: "nba-logo.png",
                confrontTeams: [{ name: "Lakers" }, { name: "Celtics" }],
              },
            ],
          },
        },
      });
      mockFetchMatchBasicData.mockResolvedValueOnce({
        body: {
          endTime: Date.now() + 60 * 60 * 1000,
          multiPlayList: {
            liveList: [
              {
                name: "中文解说",
                pID: "live001",
                startTimeStr: "2026-02-28 20:00",
              },
            ],
          },
        },
      });

      await updatePlaylistData(6);

      const m3u = storageState.get("playlist:m3u") ?? "";
      const epg = storageState.get("epg:xml") ?? "";

      expect(m3u).toContain('tvg-id="LakersVSCeltics"');
      expect(epg).toContain('<channel id="LakersVSCeltics">');
      expect(epg).toContain('<programme channel="LakersVSCeltics"');
      expect(epg).toContain(
        '<title lang="zh">NBA LakersVSCeltics 中文解说 20:00</title>',
      );
    });

    it("writes replay sports XMLTV entries using preList start time when needed", async () => {
      mockDataList.mockResolvedValue([
        { name: "央视", vomsId: "v1", dataList: [] },
      ]);
      mockFetchMatchList.mockResolvedValueOnce({
        body: {
          days: ["20260227", "20260228", "20260301", "20260302"],
          matchList: {
            "20260228": [
              {
                mgdbId: "replay-match-1",
                pkInfoTitle: "ReplayTeams",
                competitionName: "英超",
                competitionLogo: "epl-logo.png",
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
            replayList: [{ name: "全场回放", pID: "replay001" }],
            preList: [{ startTimeStr: "2026-02-28 19:30" }],
          },
        },
      });
      mockFetchMatchReplayList.mockResolvedValueOnce({
        body: {
          replayList: [{ name: "全场回放", pID: "replay001" }],
        },
      });

      await updatePlaylistData(6);

      const epg = storageState.get("epg:xml") ?? "";
      expect(epg).toContain('<channel id="ReplayTeams">');
      expect(epg).toContain('<programme channel="ReplayTeams"');
      expect(epg).toContain(
        '<title lang="zh">英超 ReplayTeams 全场回放 19:30</title>',
      );
    });
  });
});
