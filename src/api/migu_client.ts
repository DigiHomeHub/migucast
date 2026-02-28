/**
 * Centralized Migu Video API client.
 * Every HTTP call to *.miguvideo.com is funneled through this module so that:
 *   1. API URLs, headers, and auth logic live in one place
 *   2. Response contracts are validated via Zod schemas
 *   3. Smoke tests can exercise each endpoint independently
 *
 * Business logic (caching, retry, file I/O, dedup) stays in src/utils/.
 */
import { fetchUrl } from "../utils/net.js";
import { getStringMd5 } from "../utils/crypto_utils.js";
import { printDebug, printRed } from "../utils/color_out.js";
import {
  CategoryListResponseSchema,
  CategoryDetailResponseSchema,
  PlaybackResponseSchema,
  MiguEpgResponseSchema,
  MatchListResponseSchema,
  MatchBasicDataResponseSchema,
  MatchReplayListResponseSchema,
  TokenRefreshResponseSchema,
  type CategoryListResponse,
  type CategoryDetailResponse,
  type PlaybackResponse,
  type MiguEpgResponse,
  type MatchListResponse,
  type MatchBasicDataResponse,
  type MatchReplayListResponse,
  type TokenRefreshResponse,
} from "./schemas.js";
import { aesEncrypt, rsaSign } from "../utils/crypto_utils.js";
import type { z } from "zod";

// ---------------------------------------------------------------------------
// Base URLs (single source of truth)
// ---------------------------------------------------------------------------

const MIGU_PROGRAM_BASE = "https://program-sc.miguvideo.com";
const MIGU_PLAY_BASE = "https://play.miguvideo.com";
const MIGU_MATCH_V6 = "http://v0-sc.miguvideo.com";
const MIGU_MATCH_VMS = "https://vms-sc.miguvideo.com";
const MIGU_MATCH_APP = "http://app-sc.miguvideo.com";
const MIGU_AUTH_BASE = "https://migu-app-umnb.miguvideo.com";

const CATEGORY_LIST_FIXED_ID = "1ff892f2b5ab4a79be6e25b69d2f5d05";

// ---------------------------------------------------------------------------
// Schema validation with graceful fallback
// ---------------------------------------------------------------------------

/**
 * Validates raw API data against a Zod schema. If validation fails, logs the
 * error and returns the raw data with a type cast — this preserves the
 * pre-refactoring behavior where data was consumed without validation.
 * Returns `undefined` only when `raw` itself is `undefined` (network failure).
 */
function validateOrFallback<T>(
  raw: unknown,
  schema: z.ZodType<T>,
  label: string,
): T | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    printRed(
      `[migu_client] ${label} schema validation failed (using raw data as fallback): ${parsed.error.message}`,
    );
    printDebug(
      `[migu_client] ${label} raw response: ${JSON.stringify(raw).substring(0, 500)}`,
    );
    return raw as T;
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Shared auth helpers (sign/salt for playback API)
// ---------------------------------------------------------------------------

interface SaltAndSign {
  salt: number | string;
  sign: string;
}

function getAuthenticatedSaltAndSign(md5: string): SaltAndSign {
  const salt = 1230024;
  const suffix = "3ce941cc3cbc40528bfd1c64f9fdf6c0migu0123";
  const sign = getStringMd5(md5 + suffix);
  return { salt, sign };
}

function getAnonymousSaltAndSign(
  md5: string,
): SaltAndSign & { clientId: string } {
  const clientId = getStringMd5(Date.now().toString());
  const salt =
    String(Math.floor(Math.random() * 1000000)).padStart(6, "0") + "25";
  const suffix = "2cac4f2c6c3346a5b34e085725ef7e33migu" + salt.substring(0, 4);
  const sign = getStringMd5(md5 + suffix);
  return { salt, sign, clientId };
}

// ---------------------------------------------------------------------------
// 1. Live TV category list
// ---------------------------------------------------------------------------

export async function fetchLiveCategories(
  timeout: number = 6000,
): Promise<CategoryListResponse | undefined> {
  const url = `${MIGU_PROGRAM_BASE}/live/v2/tv-data/${CATEGORY_LIST_FIXED_ID}`;
  printDebug(`[migu_client] fetchLiveCategories: ${url}`);
  const raw = await fetchUrl(url, {}, timeout);
  return validateOrFallback(
    raw,
    CategoryListResponseSchema,
    "fetchLiveCategories",
  );
}

// ---------------------------------------------------------------------------
// 2. Category channel detail
// ---------------------------------------------------------------------------

export async function fetchCategoryDetail(
  vomsId: string,
  timeout: number = 6000,
): Promise<CategoryDetailResponse | undefined> {
  const url = `${MIGU_PROGRAM_BASE}/live/v2/tv-data/${vomsId}`;
  printDebug(`[migu_client] fetchCategoryDetail: ${url}`);
  const raw = await fetchUrl(url, {}, timeout);
  return validateOrFallback(
    raw,
    CategoryDetailResponseSchema,
    "fetchCategoryDetail",
  );
}

// ---------------------------------------------------------------------------
// 3. Authenticated playback URL
// ---------------------------------------------------------------------------

export interface PlaybackUrlOptions {
  userId?: string;
  token?: string;
  enableHdr?: boolean;
  enableH265?: boolean;
}

export async function fetchPlaybackUrl(
  pid: string,
  rateType: number,
  opts: PlaybackUrlOptions = {},
  timeout: number = 6000,
): Promise<PlaybackResponse | undefined> {
  const timestamp = Date.now();
  const appVersion = "26000370";
  const headers: Record<string, string | number> = {
    AppVersion: 2600037000,
    TerminalId: "android",
    "X-UP-CLIENT-CHANNEL-ID": "2600037000-99000-200300220100002",
  };

  if (pid !== "641886683" && pid !== "641886773") {
    headers["appCode"] = "miguvideo_default_android";
  }

  if (rateType !== 2 && opts.userId && opts.token) {
    headers.UserId = opts.userId;
    headers.UserToken = opts.token;
  }

  const str = timestamp + pid + appVersion;
  const md5 = getStringMd5(str);
  const result = getAuthenticatedSaltAndSign(md5);

  let hdrParam = "";
  if (opts.enableHdr) {
    hdrParam = "&4kvivid=true&2Kvivid=true&vivid=2";
  }
  let h265Param = "";
  if (opts.enableH265) {
    h265Param = "&h265N=true";
  }

  const params =
    "?sign=" +
    result.sign +
    "&rateType=" +
    rateType +
    "&contId=" +
    pid +
    "&timestamp=" +
    timestamp +
    "&salt=" +
    result.salt +
    "&flvEnable=true&super4k=true" +
    (rateType === 9 ? "&ott=true" : "") +
    h265Param +
    hdrParam;

  const url = `${MIGU_PLAY_BASE}/playurl/v1/play/playurl${params}`;
  printDebug(`[migu_client] fetchPlaybackUrl: ${url}`);
  const raw = await fetchUrl(
    url,
    {
      headers: headers as Record<string, string>,
    },
    timeout,
  );
  return validateOrFallback(raw, PlaybackResponseSchema, "fetchPlaybackUrl");
}

// ---------------------------------------------------------------------------
// 4. Anonymous 720p playback URL
// ---------------------------------------------------------------------------

export async function fetchPlaybackUrl720p(
  pid: string,
  persistentClientId?: string,
  opts: { enableHdr?: boolean; enableH265?: boolean } = {},
  timeout: number = 6000,
): Promise<PlaybackResponse | undefined> {
  const timestamp = Math.round(Date.now()).toString();
  const appVersion = "2600034600";
  const appVersionId = appVersion + "-99000-201600010010028";

  const str = timestamp + pid + appVersion.substring(0, 8);
  const md5 = getStringMd5(str);
  const { salt, sign, clientId } = getAnonymousSaltAndSign(md5);

  const headers: Record<string, string> = {
    AppVersion: appVersion,
    TerminalId: "android",
    "X-UP-CLIENT-CHANNEL-ID": appVersionId,
    ClientId: persistentClientId ?? clientId,
  };

  if (pid !== "641886683" && pid !== "641886773") {
    headers["appCode"] = "miguvideo_default_android";
  }

  let hdrParam = "";
  if (opts.enableHdr) {
    hdrParam = "&4kvivid=true&2Kvivid=true&vivid=2";
  }
  let h265Param = "";
  if (opts.enableH265) {
    h265Param = "&h265N=true";
  }

  const params =
    "?sign=" +
    sign +
    "&rateType=3" +
    "&contId=" +
    pid +
    "&timestamp=" +
    timestamp +
    "&salt=" +
    salt +
    "&flvEnable=true&super4k=true" +
    h265Param +
    hdrParam;

  const url = `${MIGU_PLAY_BASE}/playurl/v1/play/playurl${params}`;
  printDebug(`[migu_client] fetchPlaybackUrl720p: ${url}`);
  const raw = await fetchUrl(url, { headers }, timeout);
  return validateOrFallback(
    raw,
    PlaybackResponseSchema,
    "fetchPlaybackUrl720p",
  );
}

// ---------------------------------------------------------------------------
// 5. Migu EPG schedule
// ---------------------------------------------------------------------------

export async function fetchMiguEpg(
  programId: string,
  dateStr: string,
  timeout: number = 6000,
): Promise<MiguEpgResponse | undefined> {
  const url = `${MIGU_PROGRAM_BASE}/live/v2/tv-programs-data/${programId}/${dateStr}`;
  printDebug(`[migu_client] fetchMiguEpg: ${url}`);
  const raw = await fetchUrl(url, {}, timeout);
  return validateOrFallback(raw, MiguEpgResponseSchema, "fetchMiguEpg");
}

// ---------------------------------------------------------------------------
// 6. Sports match list
// ---------------------------------------------------------------------------

export async function fetchMatchList(
  timeout: number = 6000,
): Promise<MatchListResponse | undefined> {
  const url = `${MIGU_MATCH_V6}/vms-match/v6/staticcache/basic/match-list/normal-match-list/0/all/default/1/miguvideo`;
  printDebug(`[migu_client] fetchMatchList: ${url}`);
  const raw = await fetchUrl(url, {}, timeout);
  return validateOrFallback(raw, MatchListResponseSchema, "fetchMatchList");
}

// ---------------------------------------------------------------------------
// 7. Sports match basic data
// ---------------------------------------------------------------------------

export async function fetchMatchBasicData(
  mgdbId: string,
  timeout: number = 6000,
): Promise<MatchBasicDataResponse | undefined> {
  const url = `${MIGU_MATCH_VMS}/vms-match/v6/staticcache/basic/basic-data/${mgdbId}/miguvideo`;
  printDebug(`[migu_client] fetchMatchBasicData: ${url}`);
  const raw = await fetchUrl(url, {}, timeout);
  return validateOrFallback(
    raw,
    MatchBasicDataResponseSchema,
    "fetchMatchBasicData",
  );
}

// ---------------------------------------------------------------------------
// 8. Sports match replay list
// ---------------------------------------------------------------------------

export async function fetchMatchReplayList(
  mgdbId: string,
  timeout: number = 6000,
): Promise<MatchReplayListResponse | undefined> {
  const url = `${MIGU_MATCH_APP}/vms-match/v5/staticcache/basic/all-view-list/${mgdbId}/2/miguvideo`;
  printDebug(`[migu_client] fetchMatchReplayList: ${url}`);
  const raw = await fetchUrl(url, {}, timeout);
  return validateOrFallback(
    raw,
    MatchReplayListResponseSchema,
    "fetchMatchReplayList",
  );
}

// ---------------------------------------------------------------------------
// 9. Token refresh
// ---------------------------------------------------------------------------

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(
      /[!'()*]/g,
      (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
    )
    .replace(/%20/g, "+");
}

export async function refreshMiguToken(
  userId: string,
  token: string,
  timeout: number = 6000,
): Promise<TokenRefreshResponse | undefined> {
  const time = Math.floor(Date.now() / 1000);
  const baseData = `{"userToken":"${token}","autoDelay":true,"deviceId":"","userId":"${userId}","timestamp":"${time}"}`;

  const encryptedData = aesEncrypt(baseData);
  const data = '{"data":"' + encryptedData + '"}';

  const str = getStringMd5(data);
  const sign = percentEncode(rsaSign(str));

  const headers: Record<string, string> = {
    userId,
    userToken: token,
    "Content-Type": "application/json; charset=utf-8",
  };

  const url = `${MIGU_AUTH_BASE}/login/token_refresh_migu_plus?clientId=27fb3129-5a54-45bc-8af1-7dc8f1155501&sign=${sign}&signType=RSA`;
  printDebug(`[migu_client] refreshMiguToken: ${url}`);

  const raw = await fetchUrl(
    url,
    { headers, method: "post", body: data },
    timeout,
  );
  return validateOrFallback(
    raw,
    TokenRefreshResponseSchema,
    "refreshMiguToken",
  );
}
