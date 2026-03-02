import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/config.js", () => ({
  host: "http://test.local",
  token: "testToken",
  userId: "testUser",
  debug: false,
  logLevel: "info",
  logFile: undefined,
  dataDir: ".",
}));

vi.mock("../../../src/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  },
  setLoggerImpl: vi.fn(),
}));

vi.mock("../../../src/utils/channel_list.js", () => ({
  fetchCategoryChannels: vi.fn(),
}));

vi.mock("../../../src/utils/epg.js", () => ({
  buildEpgEntries: vi.fn(() => Promise.resolve("<channel>test</channel>")),
}));

vi.mock("../../../src/utils/refresh_token.js", () => ({
  default: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("../../../src/api/migu_client.js", () => ({
  fetchMatchList: vi.fn(),
  fetchMatchBasicData: vi.fn(),
  fetchMatchReplayList: vi.fn(),
}));

import { fetchCategoryChannels } from "../../../src/utils/channel_list.js";
import {
  fetchMatchList,
  fetchMatchBasicData,
  fetchMatchReplayList,
} from "../../../src/api/migu_client.js";
import {
  startUpdate,
  processUpdateBatch,
} from "../../../src/workers/chunked_update.js";
import type { WorkersKVNamespace } from "../../../src/platform/workers.js";

const mockFetchCategories = vi.mocked(fetchCategoryChannels);
const mockFetchMatchList = vi.mocked(fetchMatchList);
const mockFetchMatchBasicData = vi.mocked(fetchMatchBasicData);
const mockFetchMatchReplayList = vi.mocked(fetchMatchReplayList);

function createMockKV(): WorkersKVNamespace & {
  _store: Record<string, string>;
} {
  const store: Record<string, string> = {};
  return {
    _store: store,
    get: vi.fn((key: string): Promise<string | null> => {
      return Promise.resolve(store[key] ?? null);
    }),
    put: vi.fn((key: string, value: string): Promise<void> => {
      store[key] = value;
      return Promise.resolve();
    }),
  };
}

/** Run batches until the state machine reports completed. Safety cap prevents infinite loops. */
async function drainBatches(
  kv: WorkersKVNamespace,
  startBatch: number = 0,
  maxBatches: number = 50,
): Promise<number> {
  let batch = startBatch;
  for (let i = 0; i < maxBatches; i++) {
    const result = await processUpdateBatch(kv, batch);
    if (result.completed) return batch;
    batch++;
  }
  throw new Error(`State machine did not complete within ${maxBatches} calls`);
}

describe("chunked_update", () => {
  let mockKV: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockKV = createMockKV();
    mockFetchMatchList.mockResolvedValue(undefined);
  });

  describe("startUpdate", () => {
    it("fetches categories and stores initial state in KV", async () => {
      mockFetchCategories.mockResolvedValueOnce([
        {
          name: "央视",
          vomsId: "v1",
          dataList: [
            { name: "CCTV1", pid: "001", pics: { highResolutionH: "" } },
            { name: "CCTV2", pid: "002", pics: { highResolutionH: "" } },
          ],
        },
      ]);

      const state = await startUpdate(mockKV);

      expect(state.phase).toBe("processing");
      expect(state.totalChannels).toBe(2);
      expect(state.totalBatches).toBe(1);
      expect(vi.mocked(mockKV.put)).toHaveBeenCalledWith(
        "update:state",
        expect.any(String),
      );
    });

    it("computes correct number of batches for large channel lists", async () => {
      const channels = Array.from({ length: 50 }, (_, i) => ({
        name: `CH${i}`,
        pid: `${i}`,
        pics: { highResolutionH: "" },
      }));
      mockFetchCategories.mockResolvedValueOnce([
        { name: "央视", vomsId: "v1", dataList: channels },
      ]);

      const state = await startUpdate(mockKV);
      expect(state.totalBatches).toBe(3);
    });
  });

  describe("processUpdateBatch — TV phase", () => {
    it("processes TV channels then transitions to sports_init", async () => {
      mockFetchCategories.mockResolvedValueOnce([
        {
          name: "央视",
          vomsId: "v1",
          dataList: [
            { name: "CCTV1", pid: "001", pics: { highResolutionH: "" } },
            { name: "CCTV2", pid: "002", pics: { highResolutionH: "" } },
          ],
        },
      ]);

      await startUpdate(mockKV);

      const tvResult = await processUpdateBatch(mockKV, 0);
      expect(tvResult.completed).toBe(false);

      const state = JSON.parse(mockKV._store["update:state"]!);
      expect(state.phase).toBe("sports_init");

      const finalM3u = mockKV._store["playlist:m3u"];
      expect(finalM3u).toContain("#EXTM3U");
      expect(finalM3u).toContain("CCTV1");
      expect(finalM3u).toContain("CCTV2");
    });

    it("returns completed=false when more TV batches remain", async () => {
      const channels = Array.from({ length: 25 }, (_, i) => ({
        name: `CH${i}`,
        pid: `${i}`,
        pics: { highResolutionH: "" },
      }));
      mockFetchCategories.mockResolvedValueOnce([
        { name: "央视", vomsId: "v1", dataList: channels },
      ]);

      await startUpdate(mockKV);
      const result = await processUpdateBatch(mockKV, 0);
      expect(result.completed).toBe(false);

      const state = JSON.parse(mockKV._store["update:state"]!);
      expect(state.phase).toBe("processing");
    });

    it("returns completed=true when no state exists", async () => {
      const result = await processUpdateBatch(mockKV, 0);
      expect(result.completed).toBe(true);
    });

    it("assembles final TV playlists from partials on last batch", async () => {
      const channels = Array.from({ length: 25 }, (_, i) => ({
        name: `CH${i}`,
        pid: `${i}`,
        pics: { highResolutionH: "" },
      }));
      mockFetchCategories.mockResolvedValueOnce([
        { name: "All", vomsId: "v1", dataList: channels },
      ]);

      await startUpdate(mockKV);
      await processUpdateBatch(mockKV, 0);
      await processUpdateBatch(mockKV, 1);

      const finalM3u = mockKV._store["playlist:m3u"];
      const finalEpg = mockKV._store["epg:xml"];

      expect(finalM3u).toContain("#EXTM3U");
      expect(finalM3u).toContain("CH0");
      expect(finalM3u).toContain("CH24");

      expect(finalEpg).toContain("<?xml");
      expect(finalEpg).toContain("</tv>");

      const state = JSON.parse(mockKV._store["update:state"]!);
      expect(state.phase).toBe("sports_init");
    });
  });

  describe("processUpdateBatch — full TV + sports flow", () => {
    it("completes with meta:lastUpdate when no sports matches exist", async () => {
      mockFetchCategories.mockResolvedValueOnce([
        {
          name: "央视",
          vomsId: "v1",
          dataList: [
            { name: "CCTV1", pid: "001", pics: { highResolutionH: "" } },
          ],
        },
      ]);
      mockFetchMatchList.mockResolvedValueOnce(undefined);

      await startUpdate(mockKV);
      await drainBatches(mockKV);

      expect(mockKV._store["meta:lastUpdate"]).toBeDefined();
      const state = JSON.parse(mockKV._store["update:state"]!);
      expect(state.phase).toBe("done");
    });

    it("processes sports matches after TV channels", async () => {
      mockFetchCategories.mockResolvedValueOnce([
        {
          name: "央视",
          vomsId: "v1",
          dataList: [
            { name: "CCTV1", pid: "001", pics: { highResolutionH: "" } },
          ],
        },
      ]);

      mockFetchMatchList.mockResolvedValueOnce({
        body: {
          days: ["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-04"],
          matchList: {
            "2026-03-02": [
              {
                mgdbId: "m1",
                pkInfoTitle: "TeamA vs TeamB",
                competitionName: "CBA",
                competitionLogo: "https://logo.png",
                confrontTeams: [{ name: "TeamA" }, { name: "TeamB" }],
              },
            ],
          },
        },
      } as never);

      mockFetchMatchBasicData.mockResolvedValue({
        body: {
          endTime: Date.now() + 3600000,
          multiPlayList: {
            liveList: [
              {
                name: "国语直播",
                pID: "live001",
                startTimeStr: "2026-03-02 19:35:00",
              },
            ],
          },
        },
      } as never);

      await startUpdate(mockKV);
      await drainBatches(mockKV);

      const finalM3u = mockKV._store["playlist:m3u"];
      expect(finalM3u).toContain("CCTV1");
      expect(finalM3u).toContain("CBA");
      expect(finalM3u).toContain("TeamAVSTeamB");
      expect(finalM3u).toContain("live001");

      const finalTxt = mockKV._store["playlist:txt"];
      expect(finalTxt).toContain("CBA,#genre#");

      const state = JSON.parse(mockKV._store["update:state"]!);
      expect(state.phase).toBe("done");
    });

    it("processes replay matches for ended events", async () => {
      mockFetchCategories.mockResolvedValueOnce([
        {
          name: "央视",
          vomsId: "v1",
          dataList: [
            { name: "CCTV1", pid: "001", pics: { highResolutionH: "" } },
          ],
        },
      ]);

      mockFetchMatchList.mockResolvedValueOnce({
        body: {
          days: ["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-04"],
          matchList: {
            "2026-03-02": [
              {
                mgdbId: "m2",
                pkInfoTitle: "Final",
                competitionName: "NBA",
                competitionLogo: "https://nba.png",
              },
            ],
          },
        },
      } as never);

      mockFetchMatchBasicData.mockResolvedValue({
        body: {
          endTime: Date.now() - 3600000,
          keyword: "2026-03 19:00",
          multiPlayList: {
            preList: [{ startTimeStr: "2026-03-02 19:00:00" }],
          },
        },
      } as never);

      mockFetchMatchReplayList.mockResolvedValue({
        body: {
          replayList: [
            {
              name: "全场回放",
              pID: "replay001",
              startTimeStr: "2026-03-02 19:00:00",
            },
          ],
        },
      } as never);

      await startUpdate(mockKV);
      await drainBatches(mockKV);

      const finalM3u = mockKV._store["playlist:m3u"];
      expect(finalM3u).toContain("NBA");
      expect(finalM3u).toContain("replay001");
      expect(finalM3u).toContain("全场回放");

      expect(mockKV._store["meta:lastUpdate"]).toBeDefined();
    });

    it("skips highlight and training replays", async () => {
      mockFetchCategories.mockResolvedValueOnce([
        {
          name: "央视",
          vomsId: "v1",
          dataList: [
            { name: "CCTV1", pid: "001", pics: { highResolutionH: "" } },
          ],
        },
      ]);

      mockFetchMatchList.mockResolvedValueOnce({
        body: {
          days: ["d0", "d1", "d2", "d3"],
          matchList: {
            d1: [
              {
                mgdbId: "m3",
                pkInfoTitle: "Game",
                competitionName: "CBA",
                competitionLogo: "",
              },
            ],
          },
        },
      } as never);

      mockFetchMatchBasicData.mockResolvedValue({
        body: { endTime: Date.now() - 1000 },
      } as never);

      mockFetchMatchReplayList.mockResolvedValue({
        body: {
          replayList: [
            { name: "精彩集锦", pID: "skip1" },
            { name: "赛前训练", pID: "skip2" },
            { name: "全场回放", pID: "keep1" },
          ],
        },
      } as never);

      await startUpdate(mockKV);
      await drainBatches(mockKV);

      const finalM3u = mockKV._store["playlist:m3u"];
      expect(finalM3u).not.toContain("skip1");
      expect(finalM3u).not.toContain("skip2");
      expect(finalM3u).toContain("keep1");
    });
  });
});
