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

import { fetchCategoryChannels } from "../../../src/utils/channel_list.js";
import {
  startUpdate,
  processUpdateBatch,
} from "../../../src/workers/chunked_update.js";
import type { WorkersKVNamespace } from "../../../src/platform/workers.js";

const mockFetchCategories = vi.mocked(fetchCategoryChannels);

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

describe("chunked_update", () => {
  let mockKV: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockKV = createMockKV();
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

  describe("processUpdateBatch", () => {
    it("processes channels in the given batch range", async () => {
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
      const result = await processUpdateBatch(mockKV, 0);

      expect(result.completed).toBe(true);

      const finalM3u = mockKV._store["playlist:m3u"];
      expect(finalM3u).toContain("#EXTM3U");
      expect(finalM3u).toContain("CCTV1");
      expect(finalM3u).toContain("CCTV2");
    });

    it("returns completed=false when more batches remain", async () => {
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
    });

    it("returns completed=true when no state exists", async () => {
      const result = await processUpdateBatch(mockKV, 0);
      expect(result.completed).toBe(true);
    });

    it("assembles final playlists from partials on last batch", async () => {
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

      expect(mockKV._store["meta:lastUpdate"]).toBeDefined();
    });
  });
});
