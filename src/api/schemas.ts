/**
 * Zod schemas for all external API responses (Migu + CNTV).
 * Used both at runtime for contract validation and in smoke tests for
 * independently verifying that upstream APIs still conform to expectations.
 *
 * IMPORTANT: All optional fields use `.nullish()` (not `.optional()`) because
 * Migu APIs return `null` for absent values, and Zod's `.optional()` only
 * accepts `undefined`. All objects use `.passthrough()` to preserve unknown
 * fields from the API rather than stripping them.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Migu – Channel & Category APIs (program-sc.miguvideo.com)
// ---------------------------------------------------------------------------

const RawChannelInfoSchema = z
  .object({
    pID: z.string(),
    name: z.string(),
    pics: z.object({ highResolutionH: z.string() }).passthrough(),
  })
  .passthrough();

const RawLiveItemSchema = z
  .object({
    name: z.string(),
    vomsID: z.string(),
    dataList: z.array(RawChannelInfoSchema).default([]),
  })
  .passthrough();

export const CategoryListResponseSchema = z
  .object({
    body: z
      .object({
        liveList: z.array(RawLiveItemSchema),
      })
      .passthrough(),
  })
  .passthrough();

export const CategoryDetailResponseSchema = z
  .object({
    body: z
      .object({
        dataList: z.array(RawChannelInfoSchema),
      })
      .passthrough(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Migu – Playback URL API (play.miguvideo.com)
// ---------------------------------------------------------------------------

const PlaybackAuthSchema = z
  .object({
    logined: z.unknown().nullish(),
    authResult: z.string().nullish(),
    resultDesc: z.string().nullish(),
  })
  .passthrough()
  .nullish();

const PlaybackUrlInfoSchema = z
  .object({
    url: z.string().nullish(),
    rateType: z.union([z.string(), z.number()]).nullish(),
  })
  .passthrough()
  .nullish();

const PlaybackContentSchema = z
  .object({
    contId: z.string().nullish(),
  })
  .passthrough()
  .nullish();

export const PlaybackResponseSchema = z
  .object({
    rid: z.string().nullish(),
    body: z
      .object({
        urlInfo: PlaybackUrlInfoSchema,
        content: PlaybackContentSchema,
        auth: PlaybackAuthSchema,
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Migu – EPG API (program-sc.miguvideo.com)
// ---------------------------------------------------------------------------

const RawEpgItemSchema = z
  .object({
    contName: z.string(),
    startTime: z.number(),
    endTime: z.number(),
  })
  .passthrough();

export const MiguEpgResponseSchema = z
  .object({
    body: z
      .object({
        program: z
          .array(
            z
              .object({
                content: z.array(RawEpgItemSchema).nullish(),
              })
              .passthrough(),
          )
          .nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Migu – Sports / Match APIs (v0-sc / vms-sc / app-sc .miguvideo.com)
// ---------------------------------------------------------------------------

const PETeamSchema = z.object({ name: z.string() }).passthrough();

const PEMatchItemSchema = z
  .object({
    mgdbId: z.string(),
    pkInfoTitle: z.string(),
    competitionName: z.string(),
    competitionLogo: z.string(),
    confrontTeams: z.array(PETeamSchema).nullish(),
  })
  .passthrough();

const PEPlayItemSchema = z
  .object({
    name: z.string().nullish(),
    pID: z.string().nullish(),
    startTimeStr: z.string().nullish(),
  })
  .passthrough();

const PEPreItemSchema = z
  .object({
    startTimeStr: z.string().nullish(),
  })
  .passthrough();

export const MatchListResponseSchema = z
  .object({
    body: z
      .object({
        days: z.array(z.string()).nullish(),
        matchList: z.record(z.string(), z.array(PEMatchItemSchema)).nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

export const MatchBasicDataResponseSchema = z
  .object({
    body: z
      .object({
        endTime: z.number().nullish(),
        keyword: z.string().nullish(),
        replayList: z.array(PEPlayItemSchema).nullish(),
        multiPlayList: z
          .object({
            replayList: z.array(PEPlayItemSchema).nullish(),
            liveList: z.array(PEPlayItemSchema).nullish(),
            preList: z.array(PEPreItemSchema).nullish(),
          })
          .passthrough()
          .nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

export const MatchReplayListResponseSchema = z
  .object({
    body: z
      .object({
        replayList: z.array(PEPlayItemSchema).nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Migu – Token Refresh API (migu-app-umnb.miguvideo.com)
// ---------------------------------------------------------------------------

export const TokenRefreshResponseSchema = z
  .object({
    resultCode: z.string().nullish(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// CNTV – EPG API (api.cntv.cn)
// ---------------------------------------------------------------------------

const CntvEpgItemSchema = z
  .object({
    t: z.string(),
    st: z.number(),
    et: z.number(),
  })
  .passthrough();

export const CntvEpgResponseSchema = z.record(
  z.string(),
  z
    .object({
      program: z.array(CntvEpgItemSchema).nullish(),
    })
    .passthrough()
    .nullish(),
);

// ---------------------------------------------------------------------------
// Inferred TypeScript types (re-exported for consumer convenience)
// ---------------------------------------------------------------------------

export type CategoryListResponse = z.infer<typeof CategoryListResponseSchema>;
export type CategoryDetailResponse = z.infer<
  typeof CategoryDetailResponseSchema
>;
export type PlaybackResponse = z.infer<typeof PlaybackResponseSchema>;
export type MiguEpgResponse = z.infer<typeof MiguEpgResponseSchema>;
export type MatchListResponse = z.infer<typeof MatchListResponseSchema>;
export type MatchBasicDataResponse = z.infer<
  typeof MatchBasicDataResponseSchema
>;
export type MatchReplayListResponse = z.infer<
  typeof MatchReplayListResponseSchema
>;
export type TokenRefreshResponse = z.infer<typeof TokenRefreshResponseSchema>;
export type CntvEpgResponse = z.infer<typeof CntvEpgResponseSchema>;
