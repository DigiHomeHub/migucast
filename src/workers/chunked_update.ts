/**
 * Chunked update state machine for Cloudflare Workers.
 * Splits the full playlist/EPG update across multiple invocations to stay within
 * the 50 subrequests/invocation limit on the Workers free plan.
 *
 * Flow:
 *   1. startUpdate: fetch categories, compute batches, store state in KV
 *   2. processUpdateBatch(N): fetch channel details + EPG for batch N, store partial results
 *   3. Final batch: assemble all partial results into final playlist:m3u, playlist:txt, epg:xml
 */
import { fetchCategoryChannels } from "../utils/channel_list.js";
import { buildEpgEntries } from "../utils/epg.js";
import { host, token, userId } from "../config.js";
import refreshToken from "../utils/refresh_token.js";
import { logger } from "../logger.js";
import type { CategoryData } from "../types/index.js";
import type { WorkersKVNamespace } from "../platform/workers.js";

const CHANNELS_PER_BATCH = 20;
const STATE_KEY = "update:state";

export interface UpdateState {
  phase: "processing" | "done";
  categories: CategoryData[];
  currentBatch: number;
  totalBatches: number;
  totalChannels: number;
  startedAt: number;
  hours: number;
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

/** Phase 2: Process one batch of channels — fetch EPG, build partial M3U/TXT/EPG content. */
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
  if (state.phase === "done") {
    return { completed: true };
  }

  const allChannels = flattenChannels(state.categories);
  const startIdx = batch * CHANNELS_PER_BATCH;
  const endIdx = Math.min(startIdx + CHANNELS_PER_BATCH, allChannels.length);
  const batchChannels = allChannels.slice(startIdx, endIdx);

  logger.info(
    `Processing batch ${batch}/${state.totalBatches - 1}: channels ${startIdx}-${endIdx - 1}`,
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
    await assembleAndFinalize(kv, state);
    return { completed: true };
  }

  state.currentBatch = batch + 1;
  await kv.put(STATE_KEY, JSON.stringify(state));

  return { completed: false };
}

/** Phase 3: Assemble all partial results into final KV entries. */
async function assembleAndFinalize(
  kv: WorkersKVNamespace,
  state: UpdateState,
): Promise<void> {
  logger.info("Assembling final playlists from partial results");

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
  await kv.put("meta:lastUpdate", new Date().toISOString());

  // Cleanup partial keys and state
  for (let i = 0; i < state.totalBatches; i++) {
    await kv.put(`update:partial:m3u:${i}`, "");
    await kv.put(`update:partial:txt:${i}`, "");
    await kv.put(`update:partial:epg:${i}`, "");
  }

  state.phase = "done";
  await kv.put(STATE_KEY, JSON.stringify(state));

  const elapsed = (Date.now() - state.startedAt) / 1000;
  logger.info(
    `Update completed: ${state.totalChannels} channels in ${elapsed}s`,
  );
}
