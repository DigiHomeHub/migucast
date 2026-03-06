/**
 * Migu Android playback URL acquisition and 302-redirect resolution.
 * Delegates actual API calls to the centralized API layer, while keeping
 * business logic here: quality downgrade retry, ddCalcu URL signing,
 * and 302 Location header extraction with retry.
 */
import { getDdCalcuUrl, getDdCalcuUrl720p } from "./dd_calcu_url.js";
import { logger } from "../logger.js";
import { enableH265, enableHdr } from "../config.js";
import { delay } from "./channel_list.js";
import { getStringMd5 } from "./crypto_utils.js";
import type { AndroidUrlResult } from "../types/index.js";
import { fetchPlaybackUrl, fetchPlaybackUrl720p } from "../api/migu_client.js";

const clientId = getStringMd5(Date.now().toString());
const MIGU_PLAY_BASE = "https://play.miguvideo.com";

function toAbsolutePlaybackUrl(
  url: string,
  baseUrl: string = MIGU_PLAY_BASE,
): string {
  if (url === "") {
    return "";
  }
  try {
    return new URL(url).toString();
  } catch {
    try {
      return new URL(url, baseUrl).toString();
    } catch {
      return url;
    }
  }
}

/**
 * Fetches a signed playback URL via the API layer with user credentials.
 * Automatically retries at lower quality tiers when the server responds with TIPS_NEED_MEMBER.
 */
async function getAndroidUrl(
  userId: string,
  token: string,
  pid: string,
  rateType: number,
): Promise<AndroidUrlResult> {
  if (rateType <= 1) {
    return { url: "", rateType: 0, content: null };
  }

  const opts = { userId, token, enableHdr, enableH265 };

  let respData = await fetchPlaybackUrl(pid, rateType, opts);
  if (!respData) {
    return { url: "", rateType: 0, content: null };
  }
  logger.trace(respData);

  if (respData.rid === "TIPS_NEED_MEMBER") {
    logger.warn("Account has no membership, reducing quality");
    const respRateType =
      parseInt(String(respData.body?.urlInfo?.rateType)) > 4 ? 4 : 3;
    respData = await fetchPlaybackUrl(pid, respRateType, opts);
    if (!respData) {
      return { url: "", rateType: 0, content: null };
    }

    if (respData.rid === "TIPS_NEED_MEMBER") {
      logger.warn("Account is not diamond member, reducing quality");
      respData = await fetchPlaybackUrl(pid, 3, opts);
      if (!respData) {
        return { url: "", rateType: 0, content: null };
      }
    }
  }

  logger.trace(respData);
  const url = respData.body?.urlInfo?.url;

  if (!url) {
    return { url: "", rateType: 0, content: respData };
  }

  pid = respData.body?.content?.contId ?? pid;

  const resUrl = getDdCalcuUrl(url, pid, "android", rateType, userId);
  const finalRateType = respData.body?.urlInfo?.rateType;

  return {
    url: resUrl,
    rateType: parseInt(String(finalRateType ?? "0")),
    content: respData,
  };
}

/** Fetches a 720p playback URL without user credentials (anonymous access). */
async function getAndroidUrl720p(pid: string): Promise<AndroidUrlResult> {
  logger.trace("clientId: " + clientId);

  const respData = await fetchPlaybackUrl720p(pid, clientId, {
    enableHdr,
    enableH265,
  });
  if (!respData) {
    return { url: "", rateType: 0, content: null };
  }
  logger.trace(respData);

  const url = respData.body?.urlInfo?.url;

  if (!url) {
    return { url: "", rateType: 0, content: respData };
  }

  const finalRateType = respData.body?.urlInfo?.rateType;
  pid = respData.body?.content?.contId ?? pid;

  const resUrl = getDdCalcuUrl720p(url, pid);

  return {
    url: resUrl,
    rateType: parseInt(String(finalRateType ?? "0")),
    content: respData,
  };
}

/**
 * Follows a 302 redirect chain (up to 6 attempts) to extract the final stream Location.
 * Skips intermediate "bofang" redirect URLs and retries on failure with a 150ms back-off.
 */
async function resolveRedirectUrl(resObj: AndroidUrlResult): Promise<string> {
  const rawPlaybackUrl = resObj.url;
  resObj.url = toAbsolutePlaybackUrl(resObj.url);
  if (rawPlaybackUrl !== resObj.url) {
    logger.warn(
      `[diag] Normalized playback probe URL from "${rawPlaybackUrl}" to "${resObj.url}"`,
    );
  }
  logger.info(`[diag] resolveRedirectUrl start URL: ${resObj.url}`);
  try {
    let attempt = 1;
    while (attempt <= 6) {
      if (attempt >= 2) {
        logger.warn(`Fetch failed, retry #${attempt - 1}`);
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        logger.error("Request timed out");
      }, 6000);
      const obj = await fetch(resObj.url, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
      }).catch((err: unknown) => {
        clearTimeout(timeoutId);
        logger.error(err);
        return undefined;
      });
      clearTimeout(timeoutId);

      if (obj) {
        logger.info(
          `[diag] Redirect probe attempt #${attempt}: status=${obj.status}, responseUrl=${obj.url}`,
        );
        const location = obj.headers.get("Location");
        if (location && location !== "") {
          let resolvedLocation = location;
          try {
            const locationBase = obj.url === "" ? resObj.url : obj.url;
            resolvedLocation = toAbsolutePlaybackUrl(location, locationBase);
          } catch {
            // Keep raw Location when URL normalization fails.
          }
          logger.info(
            `[diag] Redirect probe attempt #${attempt}: raw Location="${location}", resolved="${resolvedLocation}"`,
          );
          const normalizedLocation = resolvedLocation.toLowerCase();
          if (
            !normalizedLocation.startsWith("http://bofang") &&
            !normalizedLocation.startsWith("https://bofang")
          ) {
            return resolvedLocation;
          }
        }
      }
      if (attempt !== 6) {
        await delay(150);
      }
      attempt++;
    }
  } catch (error) {
    logger.error(error);
  }
  logger.error("Fetch failed, returning original URL");
  return "";
}

/** Logs the user's authentication status extracted from the API response body. */
function printLoginInfo(
  resObj: AndroidUrlResult | Record<string, unknown>,
): void {
  const content = (resObj as Record<string, unknown>).content as Record<
    string,
    unknown
  > | null;
  const body = content?.body as Record<string, unknown> | undefined;
  const auth = body?.auth as Record<string, unknown> | undefined;

  if (auth?.logined) {
    logger.info("Login authentication successful");
    if (auth.authResult === "FAIL") {
      logger.error(
        `Auth failed, incomplete video content, may require VIP: ${auth.resultDesc}`,
      );
    }
  } else {
    logger.warn("Not logged in");
  }
}

export { getAndroidUrl, getAndroidUrl720p, resolveRedirectUrl, printLoginInfo };
export type { PlaybackResponse } from "../api/schemas.js";
