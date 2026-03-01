/**
 * Core HTTP request handler logic for the migucast server.
 * - `servePlaylist`: reads playlist/EPG content from storage and applies host-substitution
 * - `channel`: resolves a channel PID to a playback URL (with cache via CachePort)
 * - `channelCache`: checks and returns cached playback URLs
 */
import {
  resolveRedirectUrl,
  getAndroidUrl,
  getAndroidUrl720p,
  printLoginInfo,
} from "./android_url.js";
import { getStorage, getCache } from "../platform/context.js";
import { host, pass, rateType, token, userId } from "../config.js";
import { logger } from "../logger.js";
import type {
  AndroidUrlResult,
  CacheEntry,
  CacheLookupResult,
  ChannelResult,
  PlaylistResult,
} from "../types/index.js";

/** Reads playlist/EPG content from storage and replaces the `${replace}` placeholder with the resolved host URL. */
async function servePlaylist(
  url: string,
  headers: Record<string, string | undefined>,
  urlUserId: string,
  urlToken: string,
): Promise<PlaylistResult> {
  const result: PlaylistResult = {
    content: null,
    contentType: "text/plain;charset=UTF-8",
  };

  let storageKey = "playlist:m3u";
  switch (url) {
    case "/epg.xml":
      storageKey = "epg:xml";
      result.contentType = "text/xml;charset=UTF-8";
      break;
    case "/txt":
    case "/playlist.txt":
      storageKey = "playlist:txt";
      break;
    case "/m3u":
    case "/playlist.m3u":
      result.contentType = "audio/x-mpegurl; charset=utf-8";
      break;
    default:
      break;
  }

  try {
    const storage = getStorage();
    result.content = await storage.get(storageKey);
  } catch (error) {
    logger.error("Failed to read from storage");
    logger.error(error);
    return result;
  }

  if (url === "/epg.xml") {
    return result;
  }

  const hostHeader = headers.host ?? headers.Host;
  let replaceHost = `http://${hostHeader}`;

  if (
    host !== "" &&
    (headers["x-real-ip"] ||
      headers["x-forwarded-for"] ||
      host.indexOf(hostHeader ?? "") !== -1)
  ) {
    replaceHost = host;
  }

  if (pass !== "") {
    replaceHost = `${replaceHost}/${pass}`;
  }

  if (urlUserId !== userId && urlToken !== token) {
    replaceHost = `${replaceHost}/${urlUserId}/${urlToken}`;
  }

  result.content = `${result.content ?? ""}`.replaceAll(
    "${replace}",
    replaceHost,
  );

  return result;
}

/**
 * Resolves a channel PID from the request URL to a playback stream URL.
 * Checks cache first, then fetches via the Android API, follows 302 redirects,
 * and caches the result (3h for success, 1min for failure).
 */
async function channel(
  url: string,
  urlUserId: string,
  urlToken: string,
): Promise<ChannelResult> {
  const result: ChannelResult = {
    code: 200,
    pid: "",
    desc: "Service error",
    playUrl: "",
  };

  const urlSplit = url.split("/")[1];
  if (!urlSplit) {
    result.desc = "Invalid URL format";
    return result;
  }
  let pid = urlSplit;
  let params = "";

  if (urlSplit.match(/\?/)) {
    logger.info("Processing incoming parameters");
    const urlSplit1 = urlSplit.split("?");
    pid = urlSplit1[0]!;
    params = urlSplit1[1] ?? "";
  } else {
    logger.debug("No parameters provided");
  }

  if (isNaN(Number(pid))) {
    result.desc = "Invalid URL format";
    return result;
  }

  logger.warn("Channel ID " + pid);

  const cacheResult = await channelCache(pid, params);
  if (cacheResult.haveCache) {
    result.code = cacheResult.code;
    result.playUrl = cacheResult.playUrl;
    result.desc = cacheResult.cacheDesc;
    return result;
  }

  let resObj: AndroidUrlResult;
  try {
    if (rateType >= 3 && (urlUserId === "" || urlToken === "")) {
      resObj = await getAndroidUrl720p(pid);
    } else {
      resObj = await getAndroidUrl(urlUserId, urlToken, pid, rateType);
    }
  } catch (error) {
    logger.error(error);
    result.desc = "URL request error";
    return result;
  }
  logger.trace(`URL after encryption: ${resObj.url}`);

  if (resObj.url !== "") {
    const location = await resolveRedirectUrl(resObj);
    if (location !== "") {
      resObj.url = location;
    }
  }
  printLoginInfo(resObj);

  logger.info(`Caching program ${pid}`);
  const cacheTtlSeconds = resObj.url === "" ? 60 : 3 * 60 * 60;
  const cacheEntry: CacheEntry = {
    expiresAt: Date.now() + cacheTtlSeconds * 1000,
    url: resObj.url,
    content: resObj.content,
  };

  try {
    const cache = getCache();
    await cache.set(pid, cacheEntry, cacheTtlSeconds);
  } catch {
    logger.warn("Cache write failed, proceeding without cache");
  }

  if (resObj.url === "") {
    const contentObj = resObj.content as Record<string, unknown> | null;
    const rawMsg = contentObj?.message;
    const msg =
      typeof rawMsg === "string"
        ? rawMsg
        : "Program adjusted, temporarily unavailable";
    result.desc = `${pid} ${msg}`;
    return result;
  }
  let playUrl = resObj.url;

  if (params !== "") {
    const resultParams = new URLSearchParams(params);
    for (const [key, value] of resultParams) {
      playUrl = `${playUrl}&${key}=${value}`;
    }
  }

  logger.info("URL fetched successfully");
  result.code = 302;
  result.playUrl = playUrl;
  return result;
}

/** Looks up a cached playback URL for the given PID via CachePort; returns `haveCache: false` on miss. */
async function channelCache(
  pid: string,
  params: string,
): Promise<CacheLookupResult> {
  const cacheResult: CacheLookupResult = {
    haveCache: false,
    code: 200,
    pid: "",
    playUrl: "",
    cacheDesc: "",
  };

  try {
    const cache = getCache();
    const cacheEntry = await cache.get(pid);
    if (cacheEntry) {
      cacheResult.haveCache = true;
      let playUrl = cacheEntry.url;
      let msg = "Program adjusted, temporarily unavailable";
      if (cacheEntry.content !== null) {
        printLoginInfo(cacheEntry as unknown as AndroidUrlResult);
        msg =
          ((cacheEntry.content as Record<string, unknown>).message as string) ??
          msg;
      }
      if (playUrl === "") {
        cacheResult.cacheDesc = `${pid} ${msg}`;
        return cacheResult;
      }

      if (params !== "") {
        const resultParams = new URLSearchParams(params);
        for (const [key, value] of resultParams) {
          playUrl = `${playUrl}&${key}=${value}`;
        }
      }
      logger.info("Using cached data");
      cacheResult.code = 302;
      cacheResult.cacheDesc = "Cache hit";
      cacheResult.playUrl = playUrl;
      return cacheResult;
    }
  } catch {
    // Cache miss or error — proceed without cache
  }

  cacheResult.cacheDesc = "No cache available";
  return cacheResult;
}

export { servePlaylist, channel, channelCache };
