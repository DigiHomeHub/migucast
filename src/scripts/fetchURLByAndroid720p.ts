/**
 * Standalone script: generates static M3U and XMLTV files by fetching every
 * channel's playback URL via the anonymous Android 720p API.
 * Intended for CI/CD or cron-based playlist generation without user credentials.
 */
import { dataList, delay } from "../utils/fetchList.js";
import { getAndroidURL720p } from "../utils/androidURL.js";
import { appendFile, appendFileSync, renameFileSync, writeFile } from "../utils/fileUtil.js";
import { updatePlaybackData } from "../utils/playback.js";
import { printBlue, printGreen, printRed, printYellow } from "../utils/colorOut.js";

async function fetchURLByAndroid720p(): Promise<void> {
  const start = Date.now();

  const datas = await dataList();
  printGreen("Data fetched successfully!");

  const path = process.cwd() + "/interface.txt.bak";
  writeFile(path, "");

  printYellow("Updating...");

  const playbackFile = process.cwd() + "/playback.xml.bak";
  writeFile(
    playbackFile,
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<tv generator-info-name="Tak" generator-info-url="https://github.com/develop202/migu_video">\n`,
  );

  appendFile(
    path,
    `#EXTM3U x-tvg-url="https://gh-proxy.com/https://raw.githubusercontent.com/develop202/migu_video/refs/heads/main/playback.xml,https://hk.gh-proxy.org/raw.githubusercontent.com/develop202/migu_video/refs/heads/main/playback.xml,https://develop202.github.io/migu_video/playback.xml,https://raw.githubusercontents.com/develop202/migu_video/refs/heads/main/playback.xml" catchup="append" catchup-source="&playbackbegin=\${(b)yyyyMMddHHmmss}&playbackend=\${(e)yyyyMMddHHmmss}"\n`,
  );

  for (let i = 0; i < datas.length; i++) {
    const data = datas[i]!.dataList;
    printBlue(`Updating category ###: ${datas[i]!.name}`);

    for (let j = 0; j < data.length; j++) {
      const item = data[j]!;
      await updatePlaybackData(item, playbackFile);

      const resObj = await getAndroidURL720p(item.pID);

      if (resObj.url !== "") {
        let z = 1;
        while (z <= 6) {
          if (z >= 2) {
            printYellow(`${item.name} fetch failed, retry #${z - 1}`);
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
        printRed(`${item.name} update failed`);
        continue;
      }

      appendFile(
        path,
        `#EXTINF:-1 tvg-id="${item.name}" tvg-name="${item.name}" tvg-logo="${item.pics.highResolutionH}" group-title="${datas[i]!.name}",${item.name}\n${resObj.url}\n`,
      );
      printGreen(`${item.name} updated!`);
    }
  }

  appendFileSync(playbackFile, `</tv>\n`);
  renameFileSync(playbackFile, playbackFile.replace(".bak", ""));
  renameFileSync(path, path.replace(".bak", ""));
  const end = Date.now();
  printYellow(`Elapsed: ${(end - start) / 1000}s`);
}

void fetchURLByAndroid720p();
