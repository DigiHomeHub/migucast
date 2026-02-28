/**
 * Barrel re-export for the API layer.
 * Consumers should import from `../api/index.js` (or `../api/`) to access
 * all API client functions and Zod schemas from a single entry point.
 */
export {
  fetchLiveCategories,
  fetchCategoryDetail,
  fetchPlaybackUrl,
  fetchPlaybackUrl720p,
  fetchMiguEpg,
  fetchMatchList,
  fetchMatchBasicData,
  fetchMatchReplayList,
  refreshMiguToken,
} from "./migu_client.js";
export type { PlaybackUrlOptions } from "./migu_client.js";

export { fetchCntvEpg } from "./cntv_client.js";

export {
  CategoryListResponseSchema,
  CategoryDetailResponseSchema,
  PlaybackResponseSchema,
  MiguEpgResponseSchema,
  MatchListResponseSchema,
  MatchBasicDataResponseSchema,
  MatchReplayListResponseSchema,
  TokenRefreshResponseSchema,
  CntvEpgResponseSchema,
} from "./schemas.js";

export type {
  CategoryListResponse,
  CategoryDetailResponse,
  PlaybackResponse,
  MiguEpgResponse,
  MatchListResponse,
  MatchBasicDataResponse,
  MatchReplayListResponse,
  TokenRefreshResponse,
  CntvEpgResponse,
} from "./schemas.js";
