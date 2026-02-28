/**
 * Smoke tests for Migu Video API endpoints.
 * These tests hit real APIs over the network (no mocks) and validate
 * response contracts against Zod schemas. Run on-demand to diagnose
 * whether an issue is caused by upstream API changes or by this project's code.
 *
 * Usage: pnpm test:smoke
 */
import { describe, it, expect } from "vitest";
import { fetchUrl } from "../../src/utils/net.js";
import {
  CategoryListResponseSchema,
  CategoryDetailResponseSchema,
  PlaybackResponseSchema,
  MiguEpgResponseSchema,
  MatchListResponseSchema,
  MatchBasicDataResponseSchema,
  MatchReplayListResponseSchema,
} from "../../src/api/schemas.js";

const SMOKE_TIMEOUT = 15_000;

describe("Migu API smoke tests", () => {
  describe("Channel & Category APIs (program-sc.miguvideo.com)", () => {
    it(
      "fetchLiveCategories — returns a valid category list",
      async () => {
        const raw = await fetchUrl(
          "https://program-sc.miguvideo.com/live/v2/tv-data/1ff892f2b5ab4a79be6e25b69d2f5d05",
        );
        expect(raw).toBeDefined();

        const parsed = CategoryListResponseSchema.safeParse(raw);
        if (!parsed.success) {
          console.error(
            "[SMOKE] CategoryListResponseSchema validation failed:",
            JSON.stringify(parsed.error.issues, null, 2),
          );
          console.error(
            "[SMOKE] Raw response snippet:",
            JSON.stringify(raw, null, 2).substring(0, 500),
          );
        }
        expect(parsed.success).toBe(true);

        const liveList = parsed.data!.body.liveList;
        expect(liveList.length).toBeGreaterThan(0);
        expect(liveList[0]).toHaveProperty("vomsID");
        expect(liveList[0]).toHaveProperty("name");
      },
      SMOKE_TIMEOUT,
    );

    it(
      "fetchCategoryDetail — returns channels for a known category",
      async () => {
        const catResp = await fetchUrl(
          "https://program-sc.miguvideo.com/live/v2/tv-data/1ff892f2b5ab4a79be6e25b69d2f5d05",
        );
        const catParsed = CategoryListResponseSchema.safeParse(catResp);
        expect(catParsed.success).toBe(true);

        const firstVomsId = catParsed.data!.body.liveList[0]?.vomsID;
        expect(firstVomsId).toBeDefined();

        const raw = await fetchUrl(
          `https://program-sc.miguvideo.com/live/v2/tv-data/${firstVomsId}`,
        );
        expect(raw).toBeDefined();

        const parsed = CategoryDetailResponseSchema.safeParse(raw);
        if (!parsed.success) {
          console.error(
            "[SMOKE] CategoryDetailResponseSchema validation failed:",
            JSON.stringify(parsed.error.issues, null, 2),
          );
          console.error(
            "[SMOKE] Raw response snippet:",
            JSON.stringify(raw, null, 2).substring(0, 500),
          );
        }
        expect(parsed.success).toBe(true);
        expect(parsed.data!.body.dataList.length).toBeGreaterThan(0);
      },
      SMOKE_TIMEOUT,
    );
  });

  describe("Playback URL API (play.miguvideo.com)", () => {
    it(
      "anonymous 720p — returns a valid playback response",
      async () => {
        const { getStringMd5 } =
          await import("../../src/utils/crypto_utils.js");
        const timestamp = Math.round(Date.now()).toString();
        const pid = "641886683";
        const appVersion = "2600034600";
        const str = timestamp + pid + appVersion.substring(0, 8);
        const md5 = getStringMd5(str);

        const salt =
          String(Math.floor(Math.random() * 1000000)).padStart(6, "0") + "25";
        const suffix =
          "2cac4f2c6c3346a5b34e085725ef7e33migu" + salt.substring(0, 4);
        const sign = getStringMd5(md5 + suffix);
        const clientId = getStringMd5(Date.now().toString());

        const url =
          `https://play.miguvideo.com/playurl/v1/play/playurl` +
          `?sign=${sign}&rateType=3&contId=${pid}` +
          `&timestamp=${timestamp}&salt=${salt}` +
          `&flvEnable=true&super4k=true`;

        const raw = await fetchUrl(url, {
          headers: {
            AppVersion: appVersion,
            TerminalId: "android",
            "X-UP-CLIENT-CHANNEL-ID": appVersion + "-99000-201600010010028",
            ClientId: clientId,
          },
        });
        expect(raw).toBeDefined();

        const parsed = PlaybackResponseSchema.safeParse(raw);
        if (!parsed.success) {
          console.error(
            "[SMOKE] PlaybackResponseSchema validation failed:",
            JSON.stringify(parsed.error.issues, null, 2),
          );
          console.error(
            "[SMOKE] Raw response snippet:",
            JSON.stringify(raw, null, 2).substring(0, 500),
          );
        }
        expect(parsed.success).toBe(true);
      },
      SMOKE_TIMEOUT,
    );
  });

  describe("EPG API (program-sc.miguvideo.com)", () => {
    it(
      "fetchMiguEpg — returns program schedule data",
      async () => {
        const catResp = await fetchUrl(
          "https://program-sc.miguvideo.com/live/v2/tv-data/1ff892f2b5ab4a79be6e25b69d2f5d05",
        );
        const catParsed = CategoryListResponseSchema.safeParse(catResp);
        expect(catParsed.success).toBe(true);

        const firstVomsId = catParsed.data!.body.liveList[0]?.vomsID;
        const detailResp = await fetchUrl(
          `https://program-sc.miguvideo.com/live/v2/tv-data/${firstVomsId}`,
        );
        const detailParsed = CategoryDetailResponseSchema.safeParse(detailResp);
        expect(detailParsed.success).toBe(true);

        const firstPid = detailParsed.data!.body.dataList[0]?.pID;
        expect(firstPid).toBeDefined();

        const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        const raw = await fetchUrl(
          `https://program-sc.miguvideo.com/live/v2/tv-programs-data/${firstPid}/${today}`,
        );
        expect(raw).toBeDefined();

        const parsed = MiguEpgResponseSchema.safeParse(raw);
        if (!parsed.success) {
          console.error(
            "[SMOKE] MiguEpgResponseSchema validation failed:",
            JSON.stringify(parsed.error.issues, null, 2),
          );
          console.error(
            "[SMOKE] Raw response snippet:",
            JSON.stringify(raw, null, 2).substring(0, 500),
          );
        }
        expect(parsed.success).toBe(true);
      },
      SMOKE_TIMEOUT,
    );
  });

  describe("Sports / Match APIs", () => {
    it(
      "fetchMatchList — returns match list with days",
      async () => {
        const raw = await fetchUrl(
          "http://v0-sc.miguvideo.com/vms-match/v6/staticcache/basic/match-list/normal-match-list/0/all/default/1/miguvideo",
        );
        expect(raw).toBeDefined();

        const parsed = MatchListResponseSchema.safeParse(raw);
        if (!parsed.success) {
          console.error(
            "[SMOKE] MatchListResponseSchema validation failed:",
            JSON.stringify(parsed.error.issues, null, 2),
          );
          console.error(
            "[SMOKE] Raw response snippet:",
            JSON.stringify(raw, null, 2).substring(0, 500),
          );
        }
        expect(parsed.success).toBe(true);
      },
      SMOKE_TIMEOUT,
    );

    it(
      "fetchMatchBasicData — returns basic data for a known match",
      async () => {
        const listRaw = await fetchUrl(
          "http://v0-sc.miguvideo.com/vms-match/v6/staticcache/basic/match-list/normal-match-list/0/all/default/1/miguvideo",
        );
        const listParsed = MatchListResponseSchema.safeParse(listRaw);
        expect(listParsed.success).toBe(true);

        const days = listParsed.data!.body?.days;
        let mgdbId: string | undefined;
        if (days) {
          for (const day of days) {
            const matches = listParsed.data!.body?.matchList?.[day];
            if (matches && matches.length > 0) {
              mgdbId = matches[0]!.mgdbId;
              break;
            }
          }
        }

        if (!mgdbId) {
          console.warn(
            "[SMOKE] No match found in current match list, skipping fetchMatchBasicData",
          );
          return;
        }

        const raw = await fetchUrl(
          `https://vms-sc.miguvideo.com/vms-match/v6/staticcache/basic/basic-data/${mgdbId}/miguvideo`,
        );
        expect(raw).toBeDefined();

        const parsed = MatchBasicDataResponseSchema.safeParse(raw);
        if (!parsed.success) {
          console.error(
            "[SMOKE] MatchBasicDataResponseSchema validation failed:",
            JSON.stringify(parsed.error.issues, null, 2),
          );
          console.error(
            "[SMOKE] Raw response snippet:",
            JSON.stringify(raw, null, 2).substring(0, 500),
          );
        }
        expect(parsed.success).toBe(true);
      },
      SMOKE_TIMEOUT,
    );

    it(
      "fetchMatchReplayList — returns replay list for a known match",
      async () => {
        const listRaw = await fetchUrl(
          "http://v0-sc.miguvideo.com/vms-match/v6/staticcache/basic/match-list/normal-match-list/0/all/default/1/miguvideo",
        );
        const listParsed = MatchListResponseSchema.safeParse(listRaw);
        expect(listParsed.success).toBe(true);

        const days = listParsed.data!.body?.days;
        let mgdbId: string | undefined;
        if (days) {
          for (const day of days) {
            const matches = listParsed.data!.body?.matchList?.[day];
            if (matches && matches.length > 0) {
              mgdbId = matches[0]!.mgdbId;
              break;
            }
          }
        }

        if (!mgdbId) {
          console.warn(
            "[SMOKE] No match found in current match list, skipping fetchMatchReplayList",
          );
          return;
        }

        const raw = await fetchUrl(
          `http://app-sc.miguvideo.com/vms-match/v5/staticcache/basic/all-view-list/${mgdbId}/2/miguvideo`,
        );
        expect(raw).toBeDefined();

        const parsed = MatchReplayListResponseSchema.safeParse(raw);
        if (!parsed.success) {
          console.error(
            "[SMOKE] MatchReplayListResponseSchema validation failed:",
            JSON.stringify(parsed.error.issues, null, 2),
          );
          console.error(
            "[SMOKE] Raw response snippet:",
            JSON.stringify(raw, null, 2).substring(0, 500),
          );
        }
        expect(parsed.success).toBe(true);
      },
      SMOKE_TIMEOUT,
    );
  });
});
