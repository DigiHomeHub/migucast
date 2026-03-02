import { describe, it, expect } from "vitest";
import {
  CategoryListResponseSchema,
  CategoryDetailResponseSchema,
  PlaybackResponseSchema,
  MiguEpgResponseSchema,
  MatchListResponseSchema,
  MatchBasicDataResponseSchema,
  MatchReplayListResponseSchema,
  TokenRefreshResponseSchema,
  CntvEpgResponseSchema,
} from "../../src/api/schemas.js";

describe("schemas", () => {
  describe("CategoryListResponseSchema", () => {
    it("parses valid category list", () => {
      const data = {
        body: {
          liveList: [
            {
              name: "CCTV",
              vomsID: "abc123",
              dataList: [
                {
                  pID: "1",
                  name: "CCTV-1",
                  pics: { highResolutionH: "http://img.jpg" },
                },
              ],
            },
          ],
        },
      };
      const result = CategoryListResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it("rejects missing body", () => {
      const result = CategoryListResponseSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("preserves unknown fields via passthrough", () => {
      const data = {
        body: { liveList: [], extraField: "kept" },
        topExtra: true,
      };
      const result = CategoryListResponseSchema.parse(data);
      expect((result as Record<string, unknown>).topExtra).toBe(true);
      expect((result.body as Record<string, unknown>).extraField).toBe("kept");
    });
  });

  describe("CategoryDetailResponseSchema", () => {
    it("parses valid category detail", () => {
      const data = {
        body: {
          dataList: [
            {
              pID: "2",
              name: "CH-2",
              pics: { highResolutionH: "http://img2.jpg" },
            },
          ],
        },
      };
      expect(CategoryDetailResponseSchema.safeParse(data).success).toBe(true);
    });
  });

  describe("PlaybackResponseSchema", () => {
    it("parses valid playback response", () => {
      const data = {
        rid: "r1",
        body: {
          urlInfo: { url: "http://stream.m3u8", rateType: 3 },
          content: { contId: "c1" },
          auth: { logined: true, authResult: "OK", resultDesc: "success" },
        },
      };
      expect(PlaybackResponseSchema.safeParse(data).success).toBe(true);
    });

    it("accepts nullish nested fields", () => {
      const data = {
        rid: null,
        body: { urlInfo: null, content: null, auth: null },
      };
      expect(PlaybackResponseSchema.safeParse(data).success).toBe(true);
    });
  });

  describe("MiguEpgResponseSchema", () => {
    it("parses valid EPG response", () => {
      const data = {
        body: {
          program: [
            {
              content: [{ contName: "News", startTime: 1000, endTime: 2000 }],
            },
          ],
        },
      };
      expect(MiguEpgResponseSchema.safeParse(data).success).toBe(true);
    });

    it("accepts null body and program fields", () => {
      const data = { body: null };
      expect(MiguEpgResponseSchema.safeParse(data).success).toBe(true);
    });
  });

  describe("MatchListResponseSchema", () => {
    it("parses valid match list", () => {
      const data = {
        body: {
          days: ["2026-03-01"],
          matchList: {
            "2026-03-01": [
              {
                mgdbId: "m1",
                pkInfoTitle: "Game",
                competitionName: "NBA",
                competitionLogo: "http://logo",
                confrontTeams: [{ name: "TeamA" }, { name: "TeamB" }],
              },
            ],
          },
        },
      };
      expect(MatchListResponseSchema.safeParse(data).success).toBe(true);
    });

    it("accepts nullish body", () => {
      expect(MatchListResponseSchema.safeParse({ body: null }).success).toBe(
        true,
      );
    });
  });

  describe("MatchBasicDataResponseSchema", () => {
    it("parses valid match basic data", () => {
      const data = {
        body: {
          endTime: 1234567890,
          keyword: "nba",
          replayList: [{ name: "Replay1", pID: "p1", startTimeStr: "20:00" }],
          multiPlayList: {
            replayList: [],
            liveList: [{ name: "Live", pID: "p2", startTimeStr: "21:00" }],
            preList: [{ startTimeStr: "19:00" }],
          },
        },
      };
      expect(MatchBasicDataResponseSchema.safeParse(data).success).toBe(true);
    });
  });

  describe("MatchReplayListResponseSchema", () => {
    it("parses valid replay list", () => {
      const data = {
        body: {
          replayList: [{ name: "R1", pID: "p1", startTimeStr: "20:00" }],
        },
      };
      expect(MatchReplayListResponseSchema.safeParse(data).success).toBe(true);
    });
  });

  describe("TokenRefreshResponseSchema", () => {
    it("parses valid token refresh response", () => {
      const data = { resultCode: "REFRESH_TOKEN_SUCCESS" };
      expect(TokenRefreshResponseSchema.safeParse(data).success).toBe(true);
    });

    it("accepts nullish resultCode", () => {
      const data = { resultCode: null };
      expect(TokenRefreshResponseSchema.safeParse(data).success).toBe(true);
    });
  });

  describe("CntvEpgResponseSchema", () => {
    it("parses valid CNTV EPG response", () => {
      const data = {
        cctv1: {
          program: [{ t: "News", st: 1000, et: 2000 }],
        },
      };
      expect(CntvEpgResponseSchema.safeParse(data).success).toBe(true);
    });

    it("accepts empty record", () => {
      expect(CntvEpgResponseSchema.safeParse({}).success).toBe(true);
    });

    it("rejects non-object root", () => {
      expect(CntvEpgResponseSchema.safeParse("string").success).toBe(false);
    });
  });
});
