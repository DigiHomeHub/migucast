/**
 * Sports XMLTV helpers.
 * Builds synthetic EPG entries for sports items that are only available in M3U.
 */
import { getCompactDateTime } from "./time.js";

const DEFAULT_SPORTS_PROGRAM_DURATION_MS = 2 * 60 * 60 * 1000;
const CHINA_TZ_OFFSET_HOURS = 8;

export interface SportsEpgEntry {
  channelId: string;
  title: string;
  startTimeMs: number;
  endTimeMs: number;
}

interface DateParts {
  year: number;
  month: number;
  day: number;
}

interface ClockParts {
  hour: number;
  minute: number;
}

function escapeXml(str: string): string {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function toChinaTimeEpochMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number {
  return Date.UTC(
    year,
    month - 1,
    day,
    hour - CHINA_TZ_OFFSET_HOURS,
    minute,
    0,
    0,
  );
}

function parseKeywordDateParts(keyword: string): DateParts | null {
  const match = keyword.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  return { year, month, day };
}

function parseClockParts(clock: string): ClockParts | null {
  const match = clock.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  return { hour, minute };
}

export function parseSportsDateTime(raw: string): number | null {
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    Number.isNaN(hour) ||
    Number.isNaN(minute)
  ) {
    return null;
  }
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  return toChinaTimeEpochMs(year, month, day, hour, minute);
}

function parseSportsKeywordDate(raw: string): number | null {
  const parts = parseKeywordDateParts(raw);
  if (!parts) {
    return null;
  }
  return toChinaTimeEpochMs(parts.year, parts.month, parts.day, 0, 0);
}

export function resolveSportsReplayStartTimeMs(
  preListStartTimeStr: string | null | undefined,
  keyword: string | null | undefined,
  fallbackClock: string | null | undefined,
  nowMs: number = Date.now(),
): number {
  const parsedPreListTime = preListStartTimeStr
    ? parseSportsDateTime(preListStartTimeStr)
    : null;
  if (parsedPreListTime !== null) {
    return parsedPreListTime;
  }

  const keywordParts = keyword ? parseKeywordDateParts(keyword) : null;
  if (keywordParts) {
    const clockParts = fallbackClock ? parseClockParts(fallbackClock) : null;
    return toChinaTimeEpochMs(
      keywordParts.year,
      keywordParts.month,
      keywordParts.day,
      clockParts?.hour ?? 0,
      clockParts?.minute ?? 0,
    );
  }

  return parseSportsKeywordDate(keyword ?? "") ?? nowMs;
}

export function resolveSportsEndTimeMs(
  startTimeMs: number,
  candidateEndTimeMs: number | null | undefined,
): number {
  if (
    typeof candidateEndTimeMs === "number" &&
    Number.isFinite(candidateEndTimeMs) &&
    candidateEndTimeMs > startTimeMs
  ) {
    return candidateEndTimeMs;
  }
  return startTimeMs + DEFAULT_SPORTS_PROGRAM_DURATION_MS;
}

export function buildSportsEpgEntriesXml(entries: SportsEpgEntry[]): string {
  if (entries.length === 0) {
    return "";
  }

  const normalizedEntries = entries
    .filter((entry) => entry.channelId !== "" && entry.title !== "")
    .map((entry) => {
      const startTimeMs = Number.isFinite(entry.startTimeMs)
        ? entry.startTimeMs
        : Date.now();
      const endTimeMs = resolveSportsEndTimeMs(startTimeMs, entry.endTimeMs);
      return {
        channelId: entry.channelId,
        title: entry.title,
        startTimeMs,
        endTimeMs,
      };
    })
    .sort(
      (a, b) =>
        a.channelId.localeCompare(b.channelId) || a.startTimeMs - b.startTimeMs,
    );

  const channelSet = new Set<string>();
  const programmeSet = new Set<string>();
  const parts: string[] = [];

  for (const entry of normalizedEntries) {
    const channelIdEscaped = escapeXml(entry.channelId);
    if (!channelSet.has(entry.channelId)) {
      channelSet.add(entry.channelId);
      parts.push(
        `    <channel id="${channelIdEscaped}">\n` +
          `        <display-name lang="zh">${channelIdEscaped}</display-name>\n` +
          `    </channel>\n`,
      );
    }

    const programmeKey = `${entry.channelId}|${entry.startTimeMs}|${entry.endTimeMs}|${entry.title}`;
    if (programmeSet.has(programmeKey)) {
      continue;
    }
    programmeSet.add(programmeKey);

    const titleEscaped = escapeXml(entry.title);
    parts.push(
      `    <programme channel="${channelIdEscaped}" start="${getCompactDateTime(new Date(entry.startTimeMs))} +0800" stop="${getCompactDateTime(new Date(entry.endTimeMs))} +0800">\n` +
        `        <title lang="zh">${titleEscaped}</title>\n` +
        `    </programme>\n`,
    );
  }

  return parts.join("");
}

export function mergeXmltvWithEntries(
  existingXml: string,
  entriesXml: string,
  generatorInfoUrl: string,
): string {
  if (entriesXml.trim() === "") {
    return existingXml;
  }

  const closeTag = "</tv>";
  const closeTagIndex = existingXml.lastIndexOf(closeTag);
  if (closeTagIndex !== -1) {
    const beforeClose = existingXml.slice(0, closeTagIndex);
    const normalizedBeforeClose = beforeClose.endsWith("\n")
      ? beforeClose
      : `${beforeClose}\n`;
    return `${normalizedBeforeClose}${entriesXml}${existingXml.slice(closeTagIndex)}`;
  }

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<tv generator-info-name="Tak" generator-info-url="${escapeXml(generatorInfoUrl)}">\n` +
    `${entriesXml}</tv>\n`
  );
}
