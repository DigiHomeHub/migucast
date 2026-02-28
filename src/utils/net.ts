/**
 * Network utilities for the application.
 * Provides local IP address discovery and a generic JSON-over-HTTP fetch wrapper
 * with configurable timeout and AbortController support.
 */
import os from "node:os";
import { logger } from "../logger.js";

/** Returns all non-internal IP addresses for the given IP version (4 or 6). */
function getLocalIpAddresses(ver: number = 4): string[] {
  const ips: string[] = [];
  const allInterfaces = os.networkInterfaces();
  for (const net in allInterfaces) {
    const interfaces = allInterfaces[net];
    if (!interfaces) continue;
    for (const netPort of interfaces) {
      if (netPort.family === `IPv${ver}`) {
        ips.push(netPort.address);
      }
    }
  }
  return ips;
}

/** Fetches a URL, parses JSON response, and returns `undefined` on any failure or timeout. */
async function fetchUrl(
  url: string,
  opts: RequestInit = {},
  timeout: number = 6000,
): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
    logger.error("Request timed out");
  }, timeout);

  const res = await fetch(url, {
    ...opts,
    signal: controller.signal,
  })
    .then((r) => {
      clearTimeout(timeoutId);
      return r.json();
    })
    .catch((err: unknown) => {
      logger.error(err);
      clearTimeout(timeoutId);
      return undefined;
    });

  return res;
}

export { getLocalIpAddresses, fetchUrl };
