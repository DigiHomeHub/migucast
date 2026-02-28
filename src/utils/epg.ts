/**
 * Electronic Program Guide (EPG) data fetcher and XMLTV writer.
 * Retrieves EPG schedules from two sources via the API layer:
 *   - Migu's own EPG API (for most channels)
 *   - CNTV's public EPG API (for CCTV-branded channels)
 * Outputs XMLTV-formatted `<channel>` and `<programme>` elements to a file.
 */
import { getDateString, getCompactDateTime } from "./time.js";
import { appendFileSync } from "./file_util.js";
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

/** Writes XMLTV channel and programme entries from Migu EPG data. */
async function writeEpgFromMigu(
  program: ChannelInfo,
  filePath: string,
  timeout: number = 6000,
  timezoneOffsetMs: number = 0,
): Promise<boolean> {
  const date = new Date(Date.now() + timezoneOffsetMs);
  const today = getDateString(date);
  const resp = await fetchMiguEpg(program.pid, today, timeout);
  if (!resp) {
    return false;
  }

  const rawItems = resp.body?.program?.[0]?.content;
  if (!rawItems) {
    return false;
  }

  const epgData: EpgItem[] = rawItems.map((raw) => ({
    programName: raw.contName,
    startTime: raw.startTime,
    endTime: raw.endTime,
  }));

  appendFileSync(
    filePath,
    `    <channel id="${program.name}">\n` +
      `        <display-name lang="zh">${program.name}</display-name>\n` +
      `    </channel>\n`,
  );

  for (let i = 0; i < epgData.length; i++) {
    const item = epgData[i]!;
    const programName = escapeXml(item.programName);
    appendFileSync(
      filePath,
      `    <programme channel="${program.name}" start="${getCompactDateTime(new Date(item.startTime + timezoneOffsetMs))} +0800" stop="${getCompactDateTime(new Date(item.endTime + timezoneOffsetMs))} +0800">\n` +
        `        <title lang="zh">${programName}</title>\n` +
        `    </programme>\n`,
    );
  }
  return true;
}

/** Writes XMLTV channel and programme entries from CNTV EPG data (CCTV channels only). */
async function writeEpgFromCntv(
  program: ChannelInfo,
  filePath: string,
  timeout: number = 6000,
  timezoneOffsetMs: number = 0,
): Promise<boolean> {
  const date = new Date(Date.now() + timezoneOffsetMs);
  const today = getDateString(date);
  const cntvName = cntvNames[program.name];
  if (!cntvName) return false;

  const resp = await fetchCntvEpg(cntvName, today, timeout);
  if (!resp) {
    return false;
  }

  const epgData = resp[cntvName]?.program;
  if (!epgData) {
    return false;
  }

  appendFileSync(
    filePath,
    `    <channel id="${program.name}">\n` +
      `        <display-name lang="zh">${program.name}</display-name>\n` +
      `    </channel>\n`,
  );

  for (let i = 0; i < epgData.length; i++) {
    const item = epgData[i]!;
    const programName = escapeXml(item.t);
    appendFileSync(
      filePath,
      `    <programme channel="${program.name}" start="${getCompactDateTime(new Date(item.st * 1000 + timezoneOffsetMs))} +0800" stop="${getCompactDateTime(new Date(item.et * 1000 + timezoneOffsetMs))} +0800">\n` +
        `        <title lang="zh">${programName}</title>\n` +
        `    </programme>\n`,
    );
  }
  return true;
}

/** Routes to the appropriate EPG source (CNTV for CCTV channels, Migu for all others). */
async function updateEpgData(
  program: ChannelInfo,
  filePath: string,
  timeout: number = 6000,
  timezoneOffsetMs: number = 0,
): Promise<boolean> {
  if (cntvNames[program.name]) {
    return writeEpgFromCntv(program, filePath, timeout, timezoneOffsetMs);
  }
  return writeEpgFromMigu(program, filePath, timeout, timezoneOffsetMs);
}

export { updateEpgData };
