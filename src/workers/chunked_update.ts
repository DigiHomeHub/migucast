/**
 * Chunked update state machine for Cloudflare Workers.
 * Splits the full playlist/EPG update across multiple invocations to stay within
 * the 50 subrequests/invocation limit on the Workers free plan.
 *
 * Flow:
 *   1. startUpdate: fetch categories, compute batches, store state in KV
 *   2. processUpdateBatch(N): routes to TV or sports handler based on current phase
 *     - "processing": TV channel batch → build partial M3U/TXT/EPG
 *     - "sports_init": fetch match list, flatten, compute sport batches
 *     - "sports": process match batch → build partial M3U/TXT
 *   3. Final TV batch: assemble TV playlists, transition to sports_init
 *   4. Final sports batch: append sports data to playlists, mark done
 */
import { fetchCategoryChannels } from "../utils/channel_list.js";
import { buildEpgEntries } from "../utils/epg.js";
import { host, token, userId } from "../config.js";
import refreshToken from "../utils/refresh_token.js";
import { logger } from "../logger.js";
import {
  fetchMatchList,
  fetchMatchBasicData,
  fetchMatchReplayList,
} from "../api/migu_client.js";
import type { CategoryData } from "../types/index.js";
import type { WorkersKVNamespace } from "../platform/workers.js";

const CHANNELS_PER_BATCH = 20;
const MATCHES_PER_BATCH = 15;
const STATE_KEY = "update:state";

export interface FlattenedMatch {
  mgdbId: string;
  pkInfoTitle: string;
  competitionName: string;
  competitionLogo: string;
}

export interface UpdateState {
  phase: "processing" | "sports_init" | "sports" | "done";
  categories: CategoryData[];
  currentBatch: number;
  totalBatches: number;
  totalChannels: number;
  startedAt: number;
  hours: number;
  sportMatches?: FlattenedMatch[];
  totalSportBatches?: number;
  currentSportBatch?: number;
  lastCompetition?: string;
}

function computeBatches(categories: CategoryData[]): number {
  let totalChannels = 0;
  for (const cat of categories) {
    totalChannels += cat.dataList.length;
  }
  return Math.ceil(totalChannels / CHANNELS_PER_BATCH);
}

function flattenChannels(
  categories: CategoryData[],
): Array<{ channel: CategoryData["dataList"][number]; categoryName: string }> {
  const result: Array<{
    channel: CategoryData["dataList"][number];
    categoryName: string;
  }> = [];
  for (const cat of categories) {
    for (const ch of cat.dataList) {
      result.push({ channel: ch, categoryName: cat.name });
    }
  }
  return result;
}

/** Phase 1: Fetch categories, compute batches, store state in KV. */
export async function startUpdate(
  kv: WorkersKVNamespace,
  hours: number = 0,
): Promise<UpdateState> {
  const categories = await fetchCategoryChannels();
  logger.info(`Fetched ${categories.length} categories`);

  if (!(hours % 720) && userId !== "" && token !== "") {
    const refreshed = await refreshToken(userId, token);
    logger.info(refreshed ? "Token refreshed" : "Token refresh failed");
  }

  let totalChannels = 0;
  for (const cat of categories) {
    totalChannels += cat.dataList.length;
  }

  const totalBatches = computeBatches(categories);

  const state: UpdateState = {
    phase: "processing",
    categories,
    currentBatch: 0,
    totalBatches,
    totalChannels,
    startedAt: Date.now(),
    hours,
  };

  await kv.put(STATE_KEY, JSON.stringify(state));
  logger.info(
    `Update started: ${totalChannels} channels in ${totalBatches} batches`,
  );

  return state;
}

/** Routes to the correct handler based on the current state machine phase. */
export async function processUpdateBatch(
  kv: WorkersKVNamespace,
  batch: number,
): Promise<{ completed: boolean }> {
  const stateRaw = await kv.get(STATE_KEY, { type: "text" });
  if (!stateRaw) {
    logger.warn("No update state found, skipping batch");
    return { completed: true };
  }

  const state = JSON.parse(stateRaw) as UpdateState;

  switch (state.phase) {
    case "processing":
      return processTVBatch(kv, state, batch);
    case "sports_init":
      return initSportsPhase(kv, state);
    case "sports":
      return processSportsBatch(kv, state);
    case "done":
      return { completed: true };
  }
}

/** Process one batch of TV channels — fetch EPG, build partial M3U/TXT/EPG content. */
async function processTVBatch(
  kv: WorkersKVNamespace,
  state: UpdateState,
  batch: number,
): Promise<{ completed: boolean }> {
  const allChannels = flattenChannels(state.categories);
  const startIdx = batch * CHANNELS_PER_BATCH;
  const endIdx = Math.min(startIdx + CHANNELS_PER_BATCH, allChannels.length);
  const batchChannels = allChannels.slice(startIdx, endIdx);

  logger.info(
    `Processing TV batch ${batch}/${state.totalBatches - 1}: channels ${startIdx}-${endIdx - 1}`,
  );

  const m3uParts: string[] = [];
  const txtParts: string[] = [];
  const epgParts: string[] = [];

  let lastCategory = "";
  for (const { channel, categoryName } of batchChannels) {
    if (categoryName !== lastCategory) {
      txtParts.push(`${categoryName},#genre#\n`);
      lastCategory = categoryName;
    }

    const epgXml = await buildEpgEntries(channel);
    if (epgXml) {
      epgParts.push(epgXml);
    }

    m3uParts.push(
      `#EXTINF:-1 tvg-id="${channel.name}" tvg-name="${channel.name}" tvg-logo="${channel.pics.highResolutionH}" group-title="${categoryName}",${channel.name}\n\${replace}/${channel.pid}\n`,
    );
    txtParts.push(`${channel.name},\${replace}/${channel.pid}\n`);
  }

  await kv.put(`update:partial:m3u:${batch}`, m3uParts.join(""));
  await kv.put(`update:partial:txt:${batch}`, txtParts.join(""));
  await kv.put(`update:partial:epg:${batch}`, epgParts.join(""));

  const isLastBatch = endIdx >= allChannels.length;

  if (isLastBatch) {
    await assembleTVAndTransition(kv, state);
    return { completed: false };
  }

  state.currentBatch = batch + 1;
  await kv.put(STATE_KEY, JSON.stringify(state));

  return { completed: false };
}

/** Assemble TV partial results into final KV entries, then transition to sports_init phase. */
async function assembleTVAndTransition(
  kv: WorkersKVNamespace,
  state: UpdateState,
): Promise<void> {
  logger.info("Assembling TV playlists from partial results");

  const m3uHeader = `#EXTM3U x-tvg-url="\${replace}/epg.xml" catchup="append" catchup-source="?playbackbegin=\${(b)yyyyMMddHHmmss}&playbackend=\${(e)yyyyMMddHHmmss}"\n`;
  const epgHeader =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<tv generator-info-name="Tak" generator-info-url="${host}">\n`;

  const m3uParts: string[] = [m3uHeader];
  const txtParts: string[] = [];
  const epgParts: string[] = [epgHeader];

  for (let i = 0; i < state.totalBatches; i++) {
    const m3u = await kv.get(`update:partial:m3u:${i}`, { type: "text" });
    const txt = await kv.get(`update:partial:txt:${i}`, { type: "text" });
    const epg = await kv.get(`update:partial:epg:${i}`, { type: "text" });
    if (m3u) m3uParts.push(m3u);
    if (txt) txtParts.push(txt);
    if (epg) epgParts.push(epg);
  }

  epgParts.push(`</tv>\n`);

  await kv.put("playlist:m3u", m3uParts.join(""));
  await kv.put("playlist:txt", txtParts.join(""));
  await kv.put("epg:xml", epgParts.join(""));

  for (let i = 0; i < state.totalBatches; i++) {
    await kv.put(`update:partial:m3u:${i}`, "");
    await kv.put(`update:partial:txt:${i}`, "");
    await kv.put(`update:partial:epg:${i}`, "");
  }

  const elapsed = (Date.now() - state.startedAt) / 1000;
  logger.info(`TV phase done: ${state.totalChannels} channels in ${elapsed}s`);

  state.phase = "sports_init";
  await kv.put(STATE_KEY, JSON.stringify(state));
}

// ---------------------------------------------------------------------------
// Sports (PE) phase
// ---------------------------------------------------------------------------

/** Fetch the match list, flatten matches from upcoming days, compute sport batches. */
async function initSportsPhase(
  kv: WorkersKVNamespace,
  state: UpdateState,
): Promise<{ completed: boolean }> {
  const datas = await fetchMatchList();
  if (!datas) {
    logger.warn("PE match list fetch failed, skipping sports update");
    return finishUpdate(kv, state);
  }

  const flatMatches: FlattenedMatch[] = [];
  for (let i = 1; i < 4; i++) {
    const date = datas.body?.days?.[i];
    if (!date) continue;
    const matchList = datas.body?.matchList?.[date];
    if (!matchList) continue;

    for (const data of matchList) {
      let pkInfoTitle = data.pkInfoTitle;
      if (data.confrontTeams && data.confrontTeams.length >= 2) {
        pkInfoTitle = `${data.confrontTeams[0]!.name}VS${data.confrontTeams[1]!.name}`;
      }
      flatMatches.push({
        mgdbId: data.mgdbId,
        pkInfoTitle,
        competitionName: data.competitionName,
        competitionLogo: data.competitionLogo,
      });
    }
  }

  if (flatMatches.length === 0) {
    logger.info("No sport matches found");
    return finishUpdate(kv, state);
  }

  state.phase = "sports";
  state.sportMatches = flatMatches;
  state.totalSportBatches = Math.ceil(flatMatches.length / MATCHES_PER_BATCH);
  state.currentSportBatch = 0;
  state.lastCompetition = "";
  await kv.put(STATE_KEY, JSON.stringify(state));

  logger.info(
    `Sports update: ${flatMatches.length} matches in ${state.totalSportBatches} batches`,
  );
  return { completed: false };
}

/** Process one batch of sport matches — fetch basic data + replays, build partial M3U/TXT. */
async function processSportsBatch(
  kv: WorkersKVNamespace,
  state: UpdateState,
): Promise<{ completed: boolean }> {
  const matches = state.sportMatches ?? [];
  const batch = state.currentSportBatch ?? 0;
  const startIdx = batch * MATCHES_PER_BATCH;
  const endIdx = Math.min(startIdx + MATCHES_PER_BATCH, matches.length);
  const batchMatches = matches.slice(startIdx, endIdx);

  logger.info(
    `Processing sport batch ${batch}/${(state.totalSportBatches ?? 1) - 1}: matches ${startIdx}-${endIdx - 1}`,
  );

  const m3uParts: string[] = [];
  const txtParts: string[] = [];
  let lastCompetition = state.lastCompetition ?? "";

  for (const match of batchMatches) {
    const peResult = await fetchMatchBasicData(match.mgdbId);
    if (!peResult) continue;

    if (match.competitionName !== lastCompetition) {
      lastCompetition = match.competitionName;
      txtParts.push(`${match.competitionName},#genre#\n`);
    }

    try {
      if ((peResult.body?.endTime ?? 0) < Date.now()) {
        await appendReplayEntries(match, peResult, m3uParts, txtParts);
      } else {
        appendLiveEntries(match, peResult, m3uParts, txtParts);
      }
    } catch {
      logger.warn(
        `${match.mgdbId} ${match.pkInfoTitle} update failed (non-critical)`,
      );
    }
  }

  await kv.put(`update:partial:sports:m3u:${batch}`, m3uParts.join(""));
  await kv.put(`update:partial:sports:txt:${batch}`, txtParts.join(""));

  const isLastBatch = endIdx >= matches.length;
  if (isLastBatch) {
    await assembleSportsAndFinish(kv, state);
    return { completed: true };
  }

  state.currentSportBatch = batch + 1;
  state.lastCompetition = lastCompetition;
  await kv.put(STATE_KEY, JSON.stringify(state));
  return { completed: false };
}

/** Fetch replay streams for an ended match and append entries to the builders. */
async function appendReplayEntries(
  match: FlattenedMatch,
  peResult: NonNullable<Awaited<ReturnType<typeof fetchMatchBasicData>>>,
  m3uParts: string[],
  txtParts: string[],
): Promise<void> {
  const replayResult = await fetchMatchReplayList(match.mgdbId);
  const replayList =
    replayResult?.body?.replayList ?? peResult.body?.multiPlayList?.replayList;

  if (!replayList) {
    logger.warn(`${match.mgdbId} ${match.pkInfoTitle} no replay available`);
    return;
  }

  for (const replay of replayList) {
    if (!replay.name || !replay.pID) continue;
    if (/.*集锦|训练.*/.test(replay.name)) continue;
    if (/.*回放|赛.*/.test(replay.name)) {
      let timeStr = peResult.body?.keyword?.substring(7) ?? "";
      const preList = peResult.body?.multiPlayList?.preList;
      const startTimeStr = preList?.[preList.length - 1]?.startTimeStr;
      if (startTimeStr != null) {
        timeStr = startTimeStr.substring(11, 16);
      }
      const desc = `${match.competitionName} ${match.pkInfoTitle} ${replay.name} ${timeStr}`;
      m3uParts.push(
        `#EXTINF:-1 tvg-id="${match.pkInfoTitle}" tvg-name="${desc}" tvg-logo="${match.competitionLogo}" group-title="${match.competitionName}",${desc}\n\${replace}/${replay.pID}\n`,
      );
      txtParts.push(`${desc},\${replace}/${replay.pID}\n`);
    }
  }
}

/** Append live stream entries for an ongoing match to the builders. */
function appendLiveEntries(
  match: FlattenedMatch,
  peResult: NonNullable<Awaited<ReturnType<typeof fetchMatchBasicData>>>,
  m3uParts: string[],
  txtParts: string[],
): void {
  const liveList = peResult.body?.multiPlayList?.liveList;
  if (!liveList) return;

  for (const live of liveList) {
    if (!live.name || !live.pID || !live.startTimeStr) continue;
    if (/.*集锦.*/.test(live.name)) continue;
    const desc = `${match.competitionName} ${match.pkInfoTitle} ${live.name} ${live.startTimeStr.substring(11, 16)}`;
    m3uParts.push(
      `#EXTINF:-1 tvg-id="${match.pkInfoTitle}" tvg-name="${desc}" tvg-logo="${match.competitionLogo}" group-title="${match.competitionName}",${desc}\n\${replace}/${live.pID}\n`,
    );
    txtParts.push(`${desc},\${replace}/${live.pID}\n`);
  }
}

/** Append all sport partial results to existing playlists and mark the update as done. */
async function assembleSportsAndFinish(
  kv: WorkersKVNamespace,
  state: UpdateState,
): Promise<void> {
  logger.info("Assembling sports data into playlists");

  const existingM3u = (await kv.get("playlist:m3u", { type: "text" })) ?? "";
  const existingTxt = (await kv.get("playlist:txt", { type: "text" })) ?? "";

  const m3uParts: string[] = [existingM3u];
  const txtParts: string[] = [existingTxt];

  const totalSportBatches = state.totalSportBatches ?? 0;
  for (let i = 0; i < totalSportBatches; i++) {
    const m3u = await kv.get(`update:partial:sports:m3u:${i}`, {
      type: "text",
    });
    const txt = await kv.get(`update:partial:sports:txt:${i}`, {
      type: "text",
    });
    if (m3u) m3uParts.push(m3u);
    if (txt) txtParts.push(txt);
  }

  await kv.put("playlist:m3u", m3uParts.join(""));
  await kv.put("playlist:txt", txtParts.join(""));

  for (let i = 0; i < totalSportBatches; i++) {
    await kv.put(`update:partial:sports:m3u:${i}`, "");
    await kv.put(`update:partial:sports:txt:${i}`, "");
  }

  await finishUpdate(kv, state);
}

/** Writes the completion timestamp, sets phase to done, and logs summary. */
async function finishUpdate(
  kv: WorkersKVNamespace,
  state: UpdateState,
): Promise<{ completed: boolean }> {
  await kv.put("meta:lastUpdate", new Date().toISOString());

  state.phase = "done";
  await kv.put(STATE_KEY, JSON.stringify(state));

  const elapsed = (Date.now() - state.startedAt) / 1000;
  const sportsCount = state.sportMatches?.length ?? 0;
  logger.info(
    `Update completed: ${state.totalChannels} TV channels + ${sportsCount} sport matches in ${elapsed}s`,
  );
  return { completed: true };
}
