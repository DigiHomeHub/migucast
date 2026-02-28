/**
 * Fetches live TV category and channel listings via the API layer.
 * Filters unwanted categories, sorts with CCTV first, fetches per-category
 * channel details, and deduplicates channels that appear in multiple categories.
 */
import {
  fetchLiveCategories,
  fetchCategoryDetail,
} from "../api/migu_client.js";
import type { CategoryData, ChannelInfo } from "../types/index.js";
import { printYellow } from "./color_out.js";

/** Returns a Promise that resolves after `ms` milliseconds (used for retry back-off). */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// --- Internal types ---

interface LiveItem {
  name: string;
  vomsId: string;
  dataList: Record<string, unknown>[];
  [key: string]: unknown;
}

// --- API boundary mapping (external field names → internal field names) ---

function mapChannelInfo(raw: {
  pID: string;
  name: string;
  pics: { highResolutionH: string };
}): ChannelInfo {
  return { ...raw, pid: raw.pID };
}

function mapLiveItem(raw: {
  name: string;
  vomsID: string;
  dataList: Array<{
    pID: string;
    name: string;
    pics: { highResolutionH: string };
  }>;
}): LiveItem {
  return { ...raw, vomsId: raw.vomsID };
}

/** Fetches top-level live TV categories, removes "热门", and sorts CCTV to the front. */
async function fetchCategories(): Promise<LiveItem[]> {
  const resp = await fetchLiveCategories();
  if (!resp) {
    return [];
  }

  const rawFirst = resp.body.liveList[0];
  if (rawFirst) {
    printYellow(
      `[diag] Raw API liveList[0] keys: ${Object.keys(rawFirst).join(", ")}`,
    );
    printYellow(`[diag] Raw vomsID=${rawFirst.vomsID}, name=${rawFirst.name}`);
    const rawChannel = rawFirst.dataList?.[0];
    if (rawChannel) {
      printYellow(
        `[diag] Raw channel[0] keys: ${Object.keys(rawChannel).join(", ")}`,
      );
      printYellow(`[diag] Raw pID=${rawChannel.pID}, name=${rawChannel.name}`);
    }
  }

  let liveList = resp.body.liveList.map(mapLiveItem);

  if (liveList[0]) {
    printYellow(
      `[diag] Mapped liveList[0] vomsId=${liveList[0].vomsId}, name=${liveList[0].name}`,
    );
  }

  liveList = liveList.filter((item) => item.name !== "热门");

  liveList.sort((a, b) => {
    if (a.name === "央视") return -1;
    if (b.name === "央视") return 1;
    return 0;
  });

  return liveList;
}

/** Fetches full channel data for every category and deduplicates across categories. */
async function fetchCategoryChannels(): Promise<CategoryData[]> {
  const cates = (await fetchCategories()) as CategoryData[];

  for (let i = 0; i < cates.length; i++) {
    try {
      const resp = await fetchCategoryDetail(cates[i]!.vomsId);
      if (!resp) {
        cates[i]!.dataList = [];
        continue;
      }

      if (i === 0 && resp.body.dataList[0]) {
        const rawCh = resp.body.dataList[0];
        printYellow(
          `[diag] Category detail raw channel[0] keys: ${Object.keys(rawCh).join(", ")}`,
        );
        printYellow(
          `[diag] Category detail raw pID=${rawCh.pID}, name=${rawCh.name}`,
        );
      }

      cates[i]!.dataList = resp.body.dataList.map(mapChannelInfo);

      if (i === 0 && cates[i]!.dataList[0]) {
        const mapped = cates[i]!.dataList[0]!;
        printYellow(
          `[diag] Mapped channel[0] pid=${mapped.pid}, name=${mapped.name}`,
        );
      }
    } catch {
      cates[i]!.dataList = [];
    }
  }

  return uniqueData(cates);
}

interface UniqueItem {
  categoryName: string;
  name: string;
  [key: string]: unknown;
}

/** Removes duplicate channels (by name) while preserving the first occurrence's category. */
function uniqueData(liveList: CategoryData[]): CategoryData[] {
  const allItems: UniqueItem[] = [];
  liveList.forEach((category) => {
    category.dataList.forEach((program) => {
      allItems.push({
        ...program,
        categoryName: category.name,
      });
    });
  });

  const set = new Set<string>();
  const uniqueItem: UniqueItem[] = [];

  allItems.forEach((item) => {
    if (!set.has(item.name)) {
      set.add(item.name);
      uniqueItem.push(item);
    }
  });

  const categoryMap: Record<string, CategoryData["dataList"]> = {};

  liveList.forEach((live) => {
    live.dataList = [];
    categoryMap[live.name] = [];
  });

  uniqueItem.forEach((item) => {
    const { categoryName, ...program } = item;
    categoryMap[categoryName]?.push(
      program as CategoryData["dataList"][number],
    );
  });

  liveList.forEach((live) => {
    live.dataList = categoryMap[live.name] ?? [];
  });

  return liveList;
}

export { fetchCategories, fetchCategoryChannels, delay };
