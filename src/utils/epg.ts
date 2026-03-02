/**
 * Electronic Program Guide (EPG) data fetcher and XMLTV builder.
 * Retrieves EPG schedules from two sources via the API layer:
 *   - Migu's own EPG API (for most channels)
 *   - CNTV's public EPG API (for CCTV-branded channels)
 * Returns XMLTV-formatted strings for in-memory assembly.
 */
import { getDateString, getCompactDateTime } from "./time.js";
import { cntvNames } from "./static_data.js";
import { fetchMiguEpg } from "../api/migu_client.js";
import { fetchCntvEpg } from "../api/cntv_client.js";
import type { ChannelInfo } from "../types/index.js";

interface EpgItem {
  programName: string;
  startTime: number;
  endTime: number;
}

/** Escapes the five XML special characters to their entity references. */
function escapeXml(str: string): string {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** Builds XMLTV channel + programme entries from Migu EPG data. Returns the XML string or null. */
async function buildEpgFromMigu(
  program: ChannelInfo,
  timeout: number = 6000,
  timezoneOffsetMs: number = 0,
): Promise<string | null> {
  const date = new Date(Date.now() + timezoneOffsetMs);
  const today = getDateString(date);
  const resp = await fetchMiguEpg(program.pid, today, timeout);
  if (!resp) {
    return null;
  }

  const rawItems = resp.body?.program?.[0]?.content;
  if (!rawItems) {
    return null;
  }

  const epgData: EpgItem[] = rawItems.map((raw) => ({
    programName: raw.contName,
    startTime: raw.startTime,
    endTime: raw.endTime,
  }));

  const parts: string[] = [];

  parts.push(
    `    <channel id="${program.name}">\n` +
      `        <display-name lang="zh">${program.name}</display-name>\n` +
      `    </channel>\n`,
  );

  for (let i = 0; i < epgData.length; i++) {
    const item = epgData[i]!;
    const programName = escapeXml(item.programName);
    parts.push(
      `    <programme channel="${program.name}" start="${getCompactDateTime(new Date(item.startTime + timezoneOffsetMs))} +0800" stop="${getCompactDateTime(new Date(item.endTime + timezoneOffsetMs))} +0800">\n` +
        `        <title lang="zh">${programName}</title>\n` +
        `    </programme>\n`,
    );
  }
  return parts.join("");
}

/** Builds XMLTV channel + programme entries from CNTV EPG data. Returns the XML string or null. */
async function buildEpgFromCntv(
  program: ChannelInfo,
  timeout: number = 6000,
  timezoneOffsetMs: number = 0,
): Promise<string | null> {
  const date = new Date(Date.now() + timezoneOffsetMs);
  const today = getDateString(date);
  const cntvName = cntvNames[program.name];
  if (!cntvName) return null;

  const resp = await fetchCntvEpg(cntvName, today, timeout);
  if (!resp) {
    return null;
  }

  const epgData = resp[cntvName]?.program;
  if (!epgData) {
    return null;
  }

  const parts: string[] = [];

  parts.push(
    `    <channel id="${program.name}">\n` +
      `        <display-name lang="zh">${program.name}</display-name>\n` +
      `    </channel>\n`,
  );

  for (let i = 0; i < epgData.length; i++) {
    const item = epgData[i]!;
    const programName = escapeXml(item.t);
    parts.push(
      `    <programme channel="${program.name}" start="${getCompactDateTime(new Date(item.st * 1000 + timezoneOffsetMs))} +0800" stop="${getCompactDateTime(new Date(item.et * 1000 + timezoneOffsetMs))} +0800">\n` +
        `        <title lang="zh">${programName}</title>\n` +
        `    </programme>\n`,
    );
  }
  return parts.join("");
}

/**
 * Builds XMLTV entries for a single channel.
 * Routes to CNTV source for CCTV channels, Migu for all others.
 * Returns the XML string or null on failure.
 */
async function buildEpgEntries(
  program: ChannelInfo,
  timeout: number = 6000,
  timezoneOffsetMs: number = 0,
): Promise<string | null> {
  if (cntvNames[program.name]) {
    return buildEpgFromCntv(program, timeout, timezoneOffsetMs);
  }
  return buildEpgFromMigu(program, timeout, timezoneOffsetMs);
}

export { buildEpgEntries };
