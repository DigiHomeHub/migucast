/**
 * Third-party channel source integration (zbpro / fengcaizb).
 * Downloads a gzip-compressed, AES-128-CBC encrypted channel list from a remote
 * repository, decrypts each stream URL, validates against a domain whitelist,
 * and produces M3U + TXT playlist files.
 */
import { printGreen, printMagenta, printRed } from "./colorOut.js";
import crypto from "node:crypto";
import { writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { debug } from "../config.js";
import { domainWhiteList, repoLinkUpdateTimestamp } from "./datas.js";
import { readFileSync } from "./fileUtil.js";
import type { ZbproChannel, ZbproURLResult } from "../types/index.js";

const KEY_ARRAY = [121, 111, 117, 33, 106, 101, 64, 49, 57, 114, 114, 36, 50, 48, 121, 35];
const IV_ARRAY = [65, 114, 101, 121, 111, 117, 124, 62, 127, 110, 54, 38, 13, 97, 110, 63];

/** Decrypts a base64-encoded AES-128-CBC ciphertext using the zbpro fixed key and IV. */
function AESdecrypt(
  baseData: string,
  keyArray: number[] = KEY_ARRAY,
  ivArray: number[] = IV_ARRAY,
): string {
  const key = Buffer.from(keyArray);
  const iv = Buffer.from(ivArray);
  const data = Buffer.from(baseData, "base64");

  const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
  decipher.setAutoPadding(true);
  const dest = Buffer.concat([decipher.update(data), decipher.final()]);
  return dest.toString();
}

function isInWhiteList(whiteList: string[], item: string): boolean {
  for (const white of whiteList) {
    if (item === white) {
      return true;
    }
  }
  return false;
}

interface DomainEntry {
  value: string;
  times: number;
}

/**
 * Fetches, decompresses, and decrypts the remote channel list.
 * Returns M3U + TXT content on success, or a numeric status code on failure/skip.
 */
async function getAllURL(): Promise<ZbproURLResult | number> {
  const channelsURLM3U: string[] = [];
  const channelsURLTXT: string[] = [];
  const domains: Record<string, DomainEntry> = {};
  let sumChannel = 0;
  let status = 0;
  const headers = { Referer: "http://pro.fengcaizb.com" };

  await fetch("http://pro.fengcaizb.com/channels/pro.gz", { headers }).then(async (pro_gz) => {
    if (!pro_gz?.ok) {
      printRed("Request failed");
      status = 2;
      return;
    }

    const bufferArray = await pro_gz.arrayBuffer();
    const buffer = Buffer.from(bufferArray);

    printMagenta("Decompressing...");
    const decompressed = gunzipSync(buffer);
    printMagenta(`Decompressed: ${buffer.length} bytes -> ${decompressed.length} bytes`);
    const resultJSON = decompressed.toString();
    const result = JSON.parse(resultJSON) as { timestamp: number; data: ZbproChannel[] };

    if (result.timestamp === repoLinkUpdateTimestamp) {
      status = 1;
      return;
    }

    const data_jsPath = `${process.cwd()}/src/utils/datas.ts`;
    const datas_js = readFileSync(data_jsPath);
    writeFileSync(
      data_jsPath,
      datas_js.toString().replace(String(repoLinkUpdateTimestamp), String(result.timestamp)),
    );

    channelsURLM3U.push(
      `#EXTM3U x-tvg-url="https://gh-proxy.com/https://raw.githubusercontent.com/develop202/migu_video/refs/heads/main/playback.xml,https://hk.gh-proxy.org/raw.githubusercontent.com/develop202/migu_video/refs/heads/main/playback.xml,https://develop202.github.io/migu_video/playback.xml,https://raw.githubusercontents.com/develop202/migu_video/refs/heads/main/playback.xml" catchup="append" catchup-source="&playbackbegin=\${(b)yyyyMMddHHmmss}&playbackend=\${(e)yyyyMMddHHmmss}"`,
    );

    let i = 0;
    let lastChannelCate = "";
    for (const channel of result.data) {
      if (channel.ct) {
        continue;
      }
      channel.title = channel.title.replace("-", "");

      for (const url of channel.urls ?? []) {
        i += 1;
        let decryptURL = AESdecrypt(url);
        if (decryptURL.startsWith("sys_http")) {
          decryptURL = decryptURL.replace("sys_", "");
        }
        if (!decryptURL.startsWith("http")) {
          continue;
        }
        if (decryptURL.indexOf("$") !== -1) {
          decryptURL = decryptURL.split("$")[0]!;
        }
        const domain = decryptURL.split("/")[2]!;
        if (!isInWhiteList(domainWhiteList, domain)) {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => {
            controller.abort();
          }, 300);
          const test = await fetch(decryptURL, { signal: controller.signal }).catch(() => {
            clearTimeout(timeoutId);
            return undefined;
          });
          clearTimeout(timeoutId);

          if (!test?.ok) {
            continue;
          }
          if (debug) {
            if (domains[domain]) {
              domains[domain].times += 1;
            } else {
              domains[domain] = { value: domain, times: 1 };
            }
          }
        }
        if (channel.province !== lastChannelCate) {
          channelsURLTXT.push(`${channel.province},#genre#`);
          lastChannelCate = channel.province ?? "";
        }
        const channelURLM3U = `#EXTINF:-1 tvg-id="${channel.title}" tvg-name="${channel.title}" tvg-logo="" group-title="${channel.province}",${channel.title}\n${decryptURL}`;
        const channelURLTXT = `${channel.title},${decryptURL}`;
        if (sumChannel === 0) {
          const updateTime = new Date(result.timestamp + 8 * 60 * 60 * 1000);
          const updateTimeStr = `Updated: ${updateTime.getFullYear()}-${updateTime.getMonth() + 1}-${updateTime.getDate()} ${String(updateTime.getHours()).padStart(2, "0")}:${String(updateTime.getMinutes()).padStart(2, "0")}:${String(updateTime.getSeconds()).padStart(2, "0")}`;
          channelsURLM3U.push(
            `#EXTINF:-1 tvg-id="${channel.title}" tvg-name="${channel.title}" tvg-logo="" group-title="${channel.province}",${updateTimeStr}\n${decryptURL}`,
          );
          channelsURLTXT.push(`${updateTimeStr},${decryptURL}`);
        }
        channelsURLM3U.push(channelURLM3U);
        channelsURLTXT.push(channelURLTXT);
        sumChannel += 1;
        printGreen(`${i} ${sumChannel} ${channel.title} added!`);
      }
    }

    const updateTime = new Date(result.timestamp + 8 * 60 * 60 * 1000);
    console.log(
      `File date: ${updateTime.getFullYear()}-${updateTime.getMonth() + 1}-${updateTime.getDate()} ${String(updateTime.getHours()).padStart(2, "0")}:${String(updateTime.getMinutes()).padStart(2, "0")}:${String(updateTime.getSeconds()).padStart(2, "0")}`,
    );
  });

  if (status !== 0) {
    return status;
  }

  const m3u = channelsURLM3U.join("\n");
  const txt = channelsURLTXT.join("\n");

  printGreen(`Total updated: ${sumChannel} channels`);
  if (debug) {
    Object.entries(domains)
      .sort((a, b) => b[1].times - a[1].times)
      .forEach(([, item]) => {
        console.log(`"${item.value}", count: ${item.times}`);
      });
  }
  return { m3u, txt };
}

/** Orchestrates the full zbpro update: fetch → decrypt → write M3U and TXT files. Returns 0 on success. */
async function updateChannels(): Promise<number> {
  const m3uFilePath = `${process.cwd()}/interface.txt`;
  const txtFilePath = `${process.cwd()}/interfaceTXT.txt`;
  const allURL = await getAllURL();
  if (typeof allURL === "number") {
    return allURL;
  }
  writeFileSync(m3uFilePath, allURL.m3u);
  writeFileSync(txtFilePath, allURL.txt);
  return 0;
}

export default updateChannels;
