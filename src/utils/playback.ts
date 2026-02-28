import { getDateString, getDateTimeString } from "./time.js";
import { appendFileSync } from "./fileUtil.js";
import { cntvNames } from "./datas.js";
import { fetchUrl } from "./net.js";
import type { ChannelInfo } from "../types/index.js";

interface PlaybackItem {
  contName: string;
  startTime: number;
  endTime: number;
}

interface CntvPlaybackItem {
  t: string;
  st: number;
  et: number;
}

async function getPlaybackData(
  programId: string,
  timeout: number = 6000,
  githubAnd8: number = 0,
): Promise<PlaybackItem[] | undefined> {
  const date = new Date(Date.now() + githubAnd8);
  const today = getDateString(date);
  const resp = (await fetchUrl(
    `https://program-sc.miguvideo.com/live/v2/tv-programs-data/${programId}/${today}`,
    {},
    timeout,
  )) as { body?: { program?: Array<{ content?: PlaybackItem[] }> } };
  return resp.body?.program?.[0]?.content;
}

function escapeXml(str: string): string {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function updatePlaybackDataByMigu(
  program: ChannelInfo,
  filePath: string,
  timeout: number = 6000,
  githubAnd8: number = 0,
): Promise<boolean> {
  const playbackData = await getPlaybackData(program.pID, timeout, githubAnd8);
  if (!playbackData) {
    return false;
  }

  appendFileSync(
    filePath,
    `    <channel id="${program.name}">\n` +
      `        <display-name lang="zh">${program.name}</display-name>\n` +
      `    </channel>\n`,
  );

  for (let i = 0; i < playbackData.length; i++) {
    const item = playbackData[i]!;
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

async function updatePlaybackDataByCntv(
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
  )) as Record<string, { program?: CntvPlaybackItem[] }>;

  const playbackData = resp[cntvName]?.program;
  if (!playbackData) {
    return false;
  }

  appendFileSync(
    filePath,
    `    <channel id="${program.name}">\n` +
      `        <display-name lang="zh">${program.name}</display-name>\n` +
      `    </channel>\n`,
  );

  for (let i = 0; i < playbackData.length; i++) {
    const item = playbackData[i]!;
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

async function updatePlaybackData(
  program: ChannelInfo,
  filePath: string,
  timeout: number = 6000,
  githubAnd8: number = 0,
): Promise<boolean> {
  if (cntvNames[program.name]) {
    return updatePlaybackDataByCntv(program, filePath, timeout, githubAnd8);
  }
  return updatePlaybackDataByMigu(program, filePath, timeout, githubAnd8);
}

export { updatePlaybackData };
