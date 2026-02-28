import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/utils/net.js", () => ({
  fetchUrl: vi.fn(),
}));

vi.mock("../../src/utils/time.js", () => ({
  getDateString: vi.fn(() => "20260228"),
  getCompactDateTime: vi.fn(() => "20260228143045"),
}));

vi.mock("../../src/utils/file_util.js", () => ({
  appendFileSync: vi.fn(),
}));

vi.mock("../../src/utils/static_data.js", () => ({
  cntvNames: { CCTV1综合: "cctv1" } as Record<string, string>,
}));

import { fetchUrl } from "../../src/utils/net.js";
import { appendFileSync } from "../../src/utils/file_util.js";
import { updateEpgData } from "../../src/utils/epg.js";
import type { ChannelInfo } from "../../src/types/index.js";

const mockFetchUrl = vi.mocked(fetchUrl);
const mockAppendFileSync = vi.mocked(appendFileSync);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("epg", () => {
  describe("updateEpgData", () => {
    const miguProgram: ChannelInfo = {
      pid: "pid001",
      name: "TestChannel",
      pics: { highResolutionH: "" },
    };

    const cntvProgram: ChannelInfo = {
      pid: "pid002",
      name: "CCTV1综合",
      pics: { highResolutionH: "" },
    };

    it("fetches migu EPG data for non-CNTV channels", async () => {
      mockFetchUrl.mockResolvedValueOnce({
        body: {
          program: [
            {
              content: [
                { programName: "News", startTime: 1000000, endTime: 1003600 },
              ],
            },
          ],
        },
      });

      const result = await updateEpgData(miguProgram, "/tmp/epg.xml");

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

    it("fetches cntv EPG data for CCTV channels", async () => {
      mockFetchUrl.mockResolvedValueOnce({
        cctv1: {
          program: [{ t: "Morning News", st: 1000, et: 1060 }],
        },
      });

      const result = await updateEpgData(cntvProgram, "/tmp/epg.xml");

      expect(result).toBe(true);
      expect(mockFetchUrl).toHaveBeenCalledWith(
        expect.stringContaining("cntv.cn"),
        {},
        6000,
      );
    });

    it("returns false when migu EPG data is unavailable", async () => {
      mockFetchUrl.mockResolvedValueOnce({
        body: { program: [{}] },
      });

      const result = await updateEpgData(miguProgram, "/tmp/epg.xml");
      expect(result).toBe(false);
    });

    it("returns false when cntv EPG data is unavailable", async () => {
      mockFetchUrl.mockResolvedValueOnce({
        cctv1: {},
      });

      const result = await updateEpgData(cntvProgram, "/tmp/epg.xml");
      expect(result).toBe(false);
    });

    it("escapes XML special characters in content names", async () => {
      mockFetchUrl.mockResolvedValueOnce({
        body: {
          program: [
            {
              content: [
                {
                  programName: "Tom & Jerry <Live>",
                  startTime: 1000000,
                  endTime: 1003600,
                },
              ],
            },
          ],
        },
      });

      await updateEpgData(miguProgram, "/tmp/epg.xml");

      const programXml = mockAppendFileSync.mock.calls[1]![1];
      expect(programXml).toContain("Tom &amp; Jerry &lt;Live&gt;");
    });

    it("passes custom timeout and timezoneOffsetMs offset", async () => {
      mockFetchUrl.mockResolvedValueOnce({
        body: { program: [{ content: [] }] },
      });

      await updateEpgData(miguProgram, "/tmp/epg.xml", 10000, 28800000);

      expect(mockFetchUrl).toHaveBeenCalledWith(expect.any(String), {}, 10000);
    });
  });
});
