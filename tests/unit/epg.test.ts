import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/api/migu_client.js", () => ({
  fetchMiguEpg: vi.fn(),
}));

vi.mock("../../src/api/cntv_client.js", () => ({
  fetchCntvEpg: vi.fn(),
}));

vi.mock("../../src/config.js", () => ({
  debug: false,
  logLevel: "info",
  logFile: undefined,
}));

vi.mock("../../src/utils/time.js", () => ({
  getDateString: vi.fn(() => "20260228"),
  getCompactDateTime: vi.fn(() => "20260228143045"),
}));

vi.mock("../../src/utils/static_data.js", () => ({
  cntvNames: { CCTV1综合: "cctv1" } as Record<string, string>,
}));

import { fetchMiguEpg } from "../../src/api/migu_client.js";
import { fetchCntvEpg } from "../../src/api/cntv_client.js";
import { buildEpgEntries } from "../../src/utils/epg.js";
import type { ChannelInfo } from "../../src/types/index.js";

const mockFetchMiguEpg = vi.mocked(fetchMiguEpg);
const mockFetchCntvEpg = vi.mocked(fetchCntvEpg);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("epg", () => {
  describe("buildEpgEntries", () => {
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

    it("fetches migu EPG data for non-CNTV channels and returns XML string", async () => {
      mockFetchMiguEpg.mockResolvedValueOnce({
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

      const result = await buildEpgEntries(miguProgram);

      expect(result).not.toBeNull();
      expect(result).toContain('channel id="TestChannel"');
      expect(result).toContain("<title");
      expect(mockFetchMiguEpg).toHaveBeenCalledWith("pid001", "20260228", 6000);
    });

    it("fetches cntv EPG data for CCTV channels", async () => {
      mockFetchCntvEpg.mockResolvedValueOnce({
        cctv1: {
          program: [{ t: "Morning News", st: 1000, et: 1060 }],
        },
      });

      const result = await buildEpgEntries(cntvProgram);

      expect(result).not.toBeNull();
      expect(result).toContain('channel id="CCTV1综合"');
      expect(mockFetchCntvEpg).toHaveBeenCalledWith("cctv1", "20260228", 6000);
    });

    it("returns null when migu EPG data is unavailable", async () => {
      mockFetchMiguEpg.mockResolvedValueOnce({
        body: { program: [{}] },
      });

      const result = await buildEpgEntries(miguProgram);
      expect(result).toBeNull();
    });

    it("returns null when migu API returns undefined", async () => {
      mockFetchMiguEpg.mockResolvedValueOnce(undefined);

      const result = await buildEpgEntries(miguProgram);
      expect(result).toBeNull();
    });

    it("returns null when cntv EPG data is unavailable", async () => {
      mockFetchCntvEpg.mockResolvedValueOnce({
        cctv1: {},
      });

      const result = await buildEpgEntries(cntvProgram);
      expect(result).toBeNull();
    });

    it("returns null when cntv API returns undefined", async () => {
      mockFetchCntvEpg.mockResolvedValueOnce(undefined);

      const result = await buildEpgEntries(cntvProgram);
      expect(result).toBeNull();
    });

    it("escapes XML special characters in content names", async () => {
      mockFetchMiguEpg.mockResolvedValueOnce({
        body: {
          program: [
            {
              content: [
                {
                  contName: "Tom & Jerry <Live>",
                  startTime: 1000000,
                  endTime: 1003600,
                },
              ],
            },
          ],
        },
      });

      const result = await buildEpgEntries(miguProgram);

      expect(result).toContain("Tom &amp; Jerry &lt;Live&gt;");
    });

    it("passes custom timeout and timezoneOffsetMs offset", async () => {
      mockFetchMiguEpg.mockResolvedValueOnce({
        body: { program: [{ content: [] }] },
      });

      await buildEpgEntries(miguProgram, 10000, 28800000);

      expect(mockFetchMiguEpg).toHaveBeenCalledWith(
        "pid001",
        "20260228",
        10000,
      );
    });
  });
});
