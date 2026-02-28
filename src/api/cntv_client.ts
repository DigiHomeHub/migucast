/**
 * CNTV (China Network Television) EPG API client.
 * Fetches program schedule data for CCTV-branded channels from the public CNTV API.
 */
import { fetchUrl } from "../utils/net.js";
import { printDebug, printRed } from "../utils/color_out.js";
import { CntvEpgResponseSchema, type CntvEpgResponse } from "./schemas.js";
import type { z } from "zod";

const CNTV_EPG_BASE = "https://api.cntv.cn";

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
      `[cntv_client] ${label} schema validation failed (using raw data as fallback): ${parsed.error.message}`,
    );
    printDebug(
      `[cntv_client] ${label} raw response: ${JSON.stringify(raw).substring(0, 500)}`,
    );
    return raw as T;
  }
  return parsed.data;
}

export async function fetchCntvEpg(
  cntvName: string,
  dateStr: string,
  timeout: number = 6000,
): Promise<CntvEpgResponse | undefined> {
  const url = `${CNTV_EPG_BASE}/epg/epginfo3?serviceId=shiyi&d=${dateStr}&c=${cntvName}`;
  printDebug(`[cntv_client] fetchCntvEpg: ${url}`);
  const raw = await fetchUrl(url, {}, timeout);
  return validateOrFallback(raw, CntvEpgResponseSchema, "fetchCntvEpg");
}
