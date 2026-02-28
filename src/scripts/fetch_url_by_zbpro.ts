/**
 * Standalone script: updates channel playlists from the zbpro third-party source
 * and regenerates XMLTV EPG data from Migu/CNTV.
 * Designed for GitHub Actions or similar CI environments (runs every 6 hours).
 */
import { logger } from "../logger.js";
import { dataDir } from "../config.js";
import { appendFileSync, renameFileSync } from "../utils/file_util.js";
import { updateEpgData } from "../utils/epg.js";
import { writeFileSync } from "node:fs";
import { fetchCategoryChannels } from "../utils/channel_list.js";
import updateChannels from "../utils/zbpro.js";

const start = new Date();
logger.info("Starting update...");

logger.info("Updating interface file...");
let updateResult = 2;
for (let i = 0; i < 3; i++) {
  try {
    updateResult = await updateChannels();
    break;
  } catch {
    logger.error("Interface update error, retrying...");
  }
}

switch (updateResult) {
  case 1:
    logger.info("Interface data is up to date, no update needed");
    break;
  case 2:
    logger.error("Interface request failed");
    process.exit(1);
    break;
  default:
    logger.info("Interface file updated!");
    break;
}

if (!(start.getHours() % 6)) {
  const datas = await fetchCategoryChannels();
  logger.info("Data fetched successfully!");

  try {
    const epgFile = `${dataDir}/epg.xml.bak`;

    writeFileSync(
      epgFile,
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<tv generator-info-name="Tak" generator-info-url="https://github.com/develop202/migu_video">\n`,
    );
    logger.info("Updating EPG file...");
    for (const data of datas) {
      for (const item of data.dataList) {
        await updateEpgData(item, epgFile, 10000, 8 * 60 * 60 * 1000);
      }
    }

    appendFileSync(epgFile, `</tv>\n`);
    renameFileSync(epgFile, epgFile.replace(".bak", ""));

    logger.info("EPG file updated!");
  } catch {
    logger.error("EPG file update failed!");
  }
}

logger.info(`Elapsed ${(Date.now() - start.getTime()) / 1000}s`);
