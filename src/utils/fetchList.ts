/**
 * Fetches live TV category and channel listings from the Migu content API.
 * Filters unwanted categories, sorts with CCTV first, fetches per-category
 * channel details, and deduplicates channels that appear in multiple categories.
 */
import { fetchUrl } from "./net.js";
import type { CategoryData } from "../types/index.js";

/** Returns a Promise that resolves after `ms` milliseconds (used for retry back-off). */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

interface LiveItem {
  name: string;
  vomsID: string;
  dataList: Record<string, unknown>[];
  [key: string]: unknown;
}

/** Fetches top-level live TV categories, removes "热门", and sorts CCTV to the front. */
async function cateList(): Promise<LiveItem[]> {
  const resp = (await fetchUrl(
    "https://program-sc.miguvideo.com/live/v2/tv-data/1ff892f2b5ab4a79be6e25b69d2f5d05",
  )) as { body: { liveList: LiveItem[] } };
  let liveList = resp.body.liveList;

  liveList = liveList.filter((item) => item.name !== "热门");

  liveList.sort((a, b) => {
    if (a.name === "央视") return -1;
    if (b.name === "央视") return 1;
    return 0;
  });

  return liveList;
}

/** Fetches full channel data for every category and deduplicates across categories. */
async function dataList(): Promise<CategoryData[]> {
  const cates = (await cateList()) as CategoryData[];

  for (let i = 0; i < cates.length; i++) {
    try {
      const resp = (await fetchUrl(
        "https://program-sc.miguvideo.com/live/v2/tv-data/" + cates[i]!.vomsID,
      )) as { body: { dataList: CategoryData["dataList"] } };
      cates[i]!.dataList = resp.body.dataList;
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

export { cateList, dataList, delay };
