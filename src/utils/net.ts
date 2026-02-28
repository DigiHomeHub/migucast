/**
 * Network utilities for the application.
 * Provides local IP address discovery and a generic JSON-over-HTTP fetch wrapper
 * with configurable timeout and AbortController support.
 */
import os from "node:os";
import { printRed } from "./colorOut.js";

/** Returns all non-internal IP addresses for the given IP version (4 or 6). */
function getLocalIPv(ver: number = 4): string[] {
  const ips: string[] = [];
  const inter = os.networkInterfaces();
  for (const net in inter) {
    const interfaces = inter[net];
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
    printRed("Request timed out");
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
      console.log(err);
      clearTimeout(timeoutId);
      return undefined;
    });

  return res;
}

export { getLocalIPv, fetchUrl };
