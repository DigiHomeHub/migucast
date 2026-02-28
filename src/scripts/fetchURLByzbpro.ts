/**
 * Standalone script: updates channel playlists from the zbpro third-party source
 * and regenerates XMLTV EPG data from Migu/CNTV.
 * Designed for GitHub Actions or similar CI environments (runs every 6 hours).
 */
import { printGreen, printMagenta, printRed } from "../utils/colorOut.js";
import { appendFileSync, renameFileSync } from "../utils/fileUtil.js";
import { updatePlaybackData } from "../utils/playback.js";
import { writeFileSync } from "node:fs";
import { dataList } from "../utils/fetchList.js";
import updateChannels from "../utils/zbpro.js";

const start = new Date();
printMagenta("Starting update...");

printMagenta("Updating interface file...");
let updateResult = 2;
for (let i = 0; i < 3; i++) {
  try {
    updateResult = await updateChannels();
    break;
  } catch {
    printRed("Interface update error, retrying...");
  }
}

switch (updateResult) {
  case 1:
    printGreen("Interface data is up to date, no update needed");
    break;
  case 2:
    printRed("Interface request failed");
    process.exit(1);
    break;
  default:
    printGreen("Interface file updated!");
    break;
}

if (!(start.getHours() % 6)) {
  const datas = await dataList();
  printGreen("Data fetched successfully!");

  try {
    const playbackFile = `${process.cwd()}/playback.xml.bak`;

    writeFileSync(
      playbackFile,
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<tv generator-info-name="Tak" generator-info-url="https://github.com/develop202/migu_video">\n`,
    );
    printMagenta("Updating playback file...");
    for (const data of datas) {
      for (const item of data.dataList) {
        await updatePlaybackData(item, playbackFile, 10000, 8 * 60 * 60 * 1000);
      }
    }

    appendFileSync(playbackFile, `</tv>\n`);
    renameFileSync(playbackFile, playbackFile.replace(".bak", ""));

    printGreen("Playback file updated!");
  } catch {
    printRed("Playback file update failed!");
  }
}

printGreen(`Elapsed ${(Date.now() - start.getTime()) / 1000}s`);
