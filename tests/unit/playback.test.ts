import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/utils/net.js", () => ({
  fetchUrl: vi.fn(),
}));

vi.mock("../../src/utils/time.js", () => ({
  getDateString: vi.fn(() => "20260228"),
  getDateTimeString: vi.fn(() => "20260228143045"),
}));

vi.mock("../../src/utils/fileUtil.js", () => ({
  appendFileSync: vi.fn(),
}));

vi.mock("../../src/utils/datas.js", () => ({
  cntvNames: { "CCTV1综合": "cctv1" } as Record<string, string>,
}));

import { fetchUrl } from "../../src/utils/net.js";
import { appendFileSync } from "../../src/utils/fileUtil.js";
import { updatePlaybackData } from "../../src/utils/playback.js";
import type { ChannelInfo } from "../../src/types/index.js";

const mockFetchUrl = vi.mocked(fetchUrl);
const mockAppendFileSync = vi.mocked(appendFileSync);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("playback", () => {
  describe("updatePlaybackData", () => {
    const miguProgram: ChannelInfo = {
      pID: "pid001",
      name: "TestChannel",
      pics: { highResolutionH: "" },
    };

    const cntvProgram: ChannelInfo = {
      pID: "pid002",
      name: "CCTV1综合",
      pics: { highResolutionH: "" },
    };

    it("fetches migu playback data for non-CNTV channels", async () => {
      mockFetchUrl.mockResolvedValueOnce({
        body: {
          program: [
            {
              content: [
                { contName: "News", startTime: 1000000, endTime: 1003600 },
              ],
            },
          ],
        },
      });

      const result = await updatePlaybackData(miguProgram, "/tmp/playback.xml");

      expect(result).toBe(true);
      expect(mockFetchUrl).toHaveBeenCalledWith(
        expect.stringContaining("pid001"),
        {},
        6000,
      );
      expect(mockAppendFileSync).toHaveBeenCalledTimes(2);
      const channelXml = mockAppendFileSync.mock.calls[0]![1];
      expect(channelXml).toContain('channel id="TestChannel"');
    });

    it("fetches cntv playback data for CCTV channels", async () => {
      mockFetchUrl.mockResolvedValueOnce({
        cctv1: {
          program: [
            { t: "Morning News", st: 1000, et: 1060 },
          ],
        },
      });

      const result = await updatePlaybackData(cntvProgram, "/tmp/playback.xml");

      expect(result).toBe(true);
      expect(mockFetchUrl).toHaveBeenCalledWith(
        expect.stringContaining("cntv.cn"),
        {},
        6000,
      );
    });

    it("returns false when migu playback data is unavailable", async () => {
      mockFetchUrl.mockResolvedValueOnce({
        body: { program: [{}] },
      });

      const result = await updatePlaybackData(miguProgram, "/tmp/playback.xml");
      expect(result).toBe(false);
    });

    it("returns false when cntv playback data is unavailable", async () => {
      mockFetchUrl.mockResolvedValueOnce({
        cctv1: {},
      });

      const result = await updatePlaybackData(cntvProgram, "/tmp/playback.xml");
      expect(result).toBe(false);
    });

    it("escapes XML special characters in content names", async () => {
      mockFetchUrl.mockResolvedValueOnce({
        body: {
          program: [
            {
              content: [
                { contName: "Tom & Jerry <Live>", startTime: 1000000, endTime: 1003600 },
              ],
            },
          ],
        },
      });

      await updatePlaybackData(miguProgram, "/tmp/playback.xml");

      const programXml = mockAppendFileSync.mock.calls[1]![1];
      expect(programXml).toContain("Tom &amp; Jerry &lt;Live&gt;");
    });

    it("passes custom timeout and githubAnd8 offset", async () => {
      mockFetchUrl.mockResolvedValueOnce({
        body: { program: [{ content: [] }] },
      });

      await updatePlaybackData(miguProgram, "/tmp/playback.xml", 10000, 28800000);

      expect(mockFetchUrl).toHaveBeenCalledWith(
        expect.any(String),
        {},
        10000,
      );
    });
  });
});
