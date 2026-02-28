/**
 * Electronic Program Guide (EPG) data fetcher and XMLTV writer.
 * Retrieves EPG schedules from two sources:
 *   - Migu's own EPG API (for most channels)
 *   - CNTV's public EPG API (for CCTV-branded channels)
 * Outputs XMLTV-formatted `<channel>` and `<programme>` elements to a file.
 */
import { getDateString, getDateTimeString } from "./time.js";
import { appendFileSync } from "./fileUtil.js";
import { cntvNames } from "./datas.js";
import { fetchUrl } from "./net.js";
import type { ChannelInfo } from "../types/index.js";

interface EpgItem {
  contName: string;
  startTime: number;
  endTime: number;
}

interface CntvEpgItem {
  t: string;
  st: number;
  et: number;
}

/** Fetches today's program schedule from the Migu EPG API for a given program ID. */
async function fetchMiguEpg(
  programId: string,
  timeout: number = 6000,
  githubAnd8: number = 0,
): Promise<EpgItem[] | undefined> {
  const date = new Date(Date.now() + githubAnd8);
  const today = getDateString(date);
  const resp = (await fetchUrl(
    `https://program-sc.miguvideo.com/live/v2/tv-programs-data/${programId}/${today}`,
    {},
    timeout,
  )) as { body?: { program?: Array<{ content?: EpgItem[] }> } };
  return resp.body?.program?.[0]?.content;
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
  githubAnd8: number = 0,
): Promise<boolean> {
  const epgData = await fetchMiguEpg(program.pID, timeout, githubAnd8);
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
    const contName = escapeXml(item.contName);
    appendFileSync(
      filePath,
      `    <programme channel="${program.name}" start="${getDateTimeString(new Date(item.startTime + githubAnd8))} +0800" stop="${getDateTimeString(new Date(item.endTime + githubAnd8))} +0800">\n` +
        `        <title lang="zh">${contName}</title>\n` +
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
  githubAnd8: number = 0,
): Promise<boolean> {
  const date = new Date(Date.now() + githubAnd8);
  const today = getDateString(date);
  const cntvName = cntvNames[program.name];
  if (!cntvName) return false;

  const resp = (await fetchUrl(
    `https://api.cntv.cn/epg/epginfo3?serviceId=shiyi&d=${today}&c=${cntvName}`,
    {},
    timeout,
  )) as Record<string, { program?: CntvEpgItem[] }>;

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
    const contName = escapeXml(item.t);
    appendFileSync(
      filePath,
      `    <programme channel="${program.name}" start="${getDateTimeString(new Date(item.st * 1000 + githubAnd8))} +0800" stop="${getDateTimeString(new Date(item.et * 1000 + githubAnd8))} +0800">\n` +
        `        <title lang="zh">${contName}</title>\n` +
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
  githubAnd8: number = 0,
): Promise<boolean> {
  if (cntvNames[program.name]) {
    return writeEpgFromCntv(program, filePath, timeout, githubAnd8);
  }
  return writeEpgFromMigu(program, filePath, timeout, githubAnd8);
}

export { updateEpgData };
