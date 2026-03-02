/**
 * Standalone script: generates static M3U and XMLTV files by fetching every
 * channel's stream URL via the anonymous Android 720p API.
 * Intended for CI/CD or cron-based playlist generation without user credentials.
 */
import { fetchCategoryChannels, delay } from "../utils/channel_list.js";
import { getAndroidUrl720p } from "../utils/android_url.js";
import {
  appendFile,
  appendFileSync,
  renameFileSync,
  writeFile,
} from "../utils/file_util.js";
import { buildEpgEntries } from "../utils/epg.js";
import { dataDir } from "../config.js";
import { logger } from "../logger.js";

async function fetchURLByAndroid720p(): Promise<void> {
  const start = Date.now();

  const datas = await fetchCategoryChannels();
  logger.info("Data fetched successfully!");

  const path = dataDir + "/playlist.m3u.bak";
  writeFile(path, "");

  logger.warn("Updating...");

  const epgFile = dataDir + "/epg.xml.bak";
  writeFile(
    epgFile,
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<tv generator-info-name="Tak" generator-info-url="https://github.com/develop202/migu_video">\n`,
  );

  appendFile(
    path,
    `#EXTM3U x-tvg-url="https://gh-proxy.com/https://raw.githubusercontent.com/develop202/migu_video/refs/heads/main/epg.xml,https://hk.gh-proxy.org/raw.githubusercontent.com/develop202/migu_video/refs/heads/main/epg.xml,https://develop202.github.io/migu_video/epg.xml,https://raw.githubusercontents.com/develop202/migu_video/refs/heads/main/epg.xml" catchup="append" catchup-source="&playbackbegin=\${(b)yyyyMMddHHmmss}&playbackend=\${(e)yyyyMMddHHmmss}"\n`,
  );

  for (let i = 0; i < datas.length; i++) {
    const data = datas[i]!.dataList;
    logger.info(`Updating category ###: ${datas[i]!.name}`);

    for (let j = 0; j < data.length; j++) {
      const item = data[j]!;
      const epgXml = await buildEpgEntries(item);
      if (epgXml) {
        appendFileSync(epgFile, epgXml);
      }

      const resObj = await getAndroidUrl720p(item.pid);

      if (resObj.url !== "") {
        let z = 1;
        while (z <= 6) {
          if (z >= 2) {
            logger.warn(`${item.name} fetch failed, retry #${z - 1}`);
          }
          const obj = await fetch(resObj.url, {
            method: "GET",
            redirect: "manual",
          });

          const location = obj.headers.get("Location");
          if (!location || location === "") {
            z++;
            continue;
          }
          if (!location.startsWith("http://bofang")) {
            resObj.url = location;
            break;
          }
          if (z !== 6) {
            await delay(150);
          }
          z++;
        }
      }

      if (resObj.url === "") {
        logger.error(`${item.name} update failed`);
        continue;
      }

      appendFile(
        path,
        `#EXTINF:-1 tvg-id="${item.name}" tvg-name="${item.name}" tvg-logo="${item.pics.highResolutionH}" group-title="${datas[i]!.name}",${item.name}\n${resObj.url}\n`,
      );
      logger.info(`${item.name} updated!`);
    }
  }

  appendFileSync(epgFile, `</tv>\n`);
  renameFileSync(epgFile, epgFile.replace(".bak", ""));
  renameFileSync(path, path.replace(".bak", ""));
  const end = Date.now();
  logger.warn(`Elapsed: ${(end - start) / 1000}s`);
}

void fetchURLByAndroid720p();
