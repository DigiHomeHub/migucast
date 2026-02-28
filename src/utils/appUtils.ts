/**
 * Core HTTP request handler logic for the migucast server.
 * - `interfaceStr`: serves playlist files (M3U, TXT, XMLTV) with host-substitution
 * - `channel`: resolves a channel PID to a playback URL (with in-memory caching)
 * - `channelCache`: checks and returns cached playback URLs to avoid redundant API calls
 */
import { get302URL, getAndroidURL, getAndroidURL720p, printLoginInfo } from "./androidURL.js";
import { readFileSync } from "./fileUtil.js";
import { host, pass, rateType, token, userId } from "../config.js";
import { printDebug, printGreen, printGrey, printRed, printYellow } from "./colorOut.js";
import type {
  AndroidURLResult,
  CacheEntry,
  CacheResult,
  ChannelResult,
  InterfaceResult,
} from "../types/index.js";
import type { IncomingHttpHeaders } from "node:http";

const urlCache: Record<string, CacheEntry> = {};

/** Reads a playlist file and replaces the `${replace}` placeholder with the resolved host URL. */
function interfaceStr(
  url: string,
  headers: IncomingHttpHeaders,
  urlUserId: string,
  urlToken: string,
): InterfaceResult {
  const result: InterfaceResult = {
    content: null,
    contentType: "text/plain;charset=UTF-8",
  };
  let fileName = process.cwd() + "/interface.txt";
  switch (url) {
    case "/playback.xml":
      fileName = process.cwd() + "/playback.xml";
      result.contentType = "text/xml;charset=UTF-8";
      break;
    case "/txt":
      fileName = process.cwd() + "/interfaceTXT.txt";
      break;
    case "/m3u":
      result.contentType = "audio/x-mpegurl; charset=utf-8";
      break;
    default:
      break;
  }
  try {
    result.content = readFileSync(fileName);
  } catch (error) {
    printRed("Failed to read file");
    console.log(error);
    return result;
  }
  if (url === "/playback.xml") {
    return result;
  }

  let replaceHost = `http://${headers.host}`;

  if (
    host !== "" &&
    (headers["x-real-ip"] || headers["x-forwarded-for"] || host.indexOf(headers.host ?? "") !== -1)
  ) {
    replaceHost = host;
  }

  if (pass !== "") {
    replaceHost = `${replaceHost}/${pass}`;
  }

  if (urlUserId !== userId && urlToken !== token) {
    replaceHost = `${replaceHost}/${urlUserId}/${urlToken}`;
  }

  result.content = `${result.content}`.replaceAll("${replace}", replaceHost);

  return result;
}

/**
 * Resolves a channel PID from the request URL to a playback stream URL.
 * Checks cache first, then fetches via the Android API, follows 302 redirects,
 * and caches the result (3h for success, 1min for failure).
 */
async function channel(url: string, urlUserId: string, urlToken: string): Promise<ChannelResult> {
  const result: ChannelResult = {
    code: 200,
    pID: "",
    desc: "Service error",
    playURL: "",
  };

  const urlSplit = url.split("/")[1];
  if (!urlSplit) {
    result.desc = "Invalid URL format";
    return result;
  }
  let pid = urlSplit;
  let params = "";

  if (urlSplit.match(/\?/)) {
    printGreen("Processing incoming parameters");
    const urlSplit1 = urlSplit.split("?");
    pid = urlSplit1[0]!;
    params = urlSplit1[1] ?? "";
  } else {
    printGrey("No parameters provided");
  }

  if (isNaN(Number(pid))) {
    result.desc = "Invalid URL format";
    return result;
  }

  printYellow("Channel ID " + pid);

  const cache = channelCache(pid, params);
  if (cache.haveCache) {
    result.code = cache.code;
    result.playURL = cache.playURL;
    result.desc = cache.cacheDesc;
    return result;
  }

  let resObj: AndroidURLResult;
  try {
    if (rateType >= 3 && (urlUserId === "" || urlToken === "")) {
      resObj = await getAndroidURL720p(pid);
    } else {
      resObj = await getAndroidURL(urlUserId, urlToken, pid, rateType);
    }
  } catch (error) {
    console.log(error);
    result.desc = "URL request error";
    return result;
  }
  printDebug(`URL after encryption: ${resObj.url}`);

  if (resObj.url !== "") {
    const location = await get302URL(resObj);
    if (location !== "") {
      resObj.url = location;
    }
  }
  printLoginInfo(resObj);

  printGreen(`Caching program ${pid}`);
  let addTime = 3 * 60 * 60 * 1000;
  if (resObj.url === "") {
    addTime = 1 * 60 * 1000;
  }

  urlCache[pid] = {
    valTime: Date.now() + addTime,
    url: resObj.url,
    content: resObj.content,
  };

  if (resObj.url === "") {
    const contentObj = resObj.content as Record<string, unknown> | null;
    const rawMsg = contentObj?.message;
    const msg = typeof rawMsg === "string" ? rawMsg : "Program adjusted, temporarily unavailable";
    result.desc = `${pid} ${msg}`;
    return result;
  }
  let playURL = resObj.url;

  if (params !== "") {
    const resultParams = new URLSearchParams(params);
    for (const [key, value] of resultParams) {
      playURL = `${playURL}&${key}=${value}`;
    }
  }

  printGreen("URL fetched successfully");
  result.code = 302;
  result.playURL = playURL;
  return result;
}

/** Looks up a cached playback URL for the given PID; returns `haveCache: false` on miss or expiry. */
function channelCache(pid: string, params: string): CacheResult {
  const cache: CacheResult = {
    haveCache: false,
    code: 200,
    pID: "",
    playURL: "",
    cacheDesc: "",
  };
  const cacheEntry = urlCache[pid];
  if (cacheEntry && typeof cacheEntry === "object") {
    const valTime = cacheEntry.valTime - Date.now();
    if (valTime >= 0) {
      cache.haveCache = true;
      let playURL = cacheEntry.url;
      let msg = "Program adjusted, temporarily unavailable";
      if (cacheEntry.content !== null) {
        printLoginInfo(cacheEntry as unknown as AndroidURLResult);
        msg = ((cacheEntry.content as Record<string, unknown>).message as string) ?? msg;
      }
      if (playURL === "") {
        cache.cacheDesc = `${pid} ${msg}`;
        return cache;
      }

      if (params !== "") {
        const resultParams = new URLSearchParams(params);
        for (const [key, value] of resultParams) {
          playURL = `${playURL}&${key}=${value}`;
        }
      }
      printGreen("Using cached data");
      cache.code = 302;
      cache.cacheDesc = "Cache hit";
      cache.playURL = playURL;
      return cache;
    }
  }
  cache.cacheDesc = "No cache available";
  return cache;
}

export { interfaceStr, channel, channelCache };
