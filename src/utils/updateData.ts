/**
 * Periodic data update orchestrator.
 * Runs two independent update pipelines:
 *   - TV: fetches channel lists, generates M3U/TXT playlists and XMLTV EPG data
 *   - PE (Sports): fetches live/replay match schedules and appends them to playlists
 * Writes to `.bak` files first, then atomically renames to avoid serving partial data.
 */
import { dataList } from "./fetchList.js";
import {
  appendFile,
  appendFileSync,
  copyFileSync,
  renameFileSync,
  writeFile,
} from "./fileUtil.js";
import { updatePlaybackData } from "./playback.js";
import { host, token, userId } from "../config.js";
import refreshToken from "./refreshToken.js";
import { printGreen, printRed, printYellow } from "./colorOut.js";
import { getDateString } from "./time.js";
import { fetchUrl } from "./net.js";

/** Fetches all TV channel data, regenerates playlist and EPG files, and refreshes the token periodically. */
async function updateTV(hours: number): Promise<void> {
  const date = new Date();
  const start = date.getTime();

  const datas = await dataList();
  printGreen("TV data fetched successfully!");

  const interfacePath = `${process.cwd()}/interface.txt.bak`;
  const interfaceTXTPath = `${process.cwd()}/interfaceTXT.txt.bak`;

  writeFile(interfacePath, "");
  writeFile(interfaceTXTPath, "");

  if (!(hours % 720)) {
    if (userId !== "" && token !== "") {
      const refreshed = await refreshToken(userId, token);
      if (refreshed) {
        printGreen("Token refreshed successfully");
      } else {
        printRed("Token refresh failed");
      }
    }
  }

  appendFile(
    interfacePath,
    `#EXTM3U x-tvg-url="\${replace}/playback.xml" catchup="append" catchup-source="?playbackbegin=\${(b)yyyyMMddHHmmss}&playbackend=\${(e)yyyyMMddHHmmss}"\n`,
  );
  printYellow("Updating TV...");

  const playbackFile = `${process.cwd()}/playback.xml.bak`;
  writeFile(
    playbackFile,
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<tv generator-info-name="Tak" generator-info-url="${host}">\n`,
  );

  for (let i = 0; i < datas.length; i++) {
    const data = datas[i]!.dataList;
    appendFile(interfaceTXTPath, `${datas[i]!.name},#genre#\n`);
    for (let j = 0; j < data.length; j++) {
      const item = data[j]!;
      await updatePlaybackData(item, playbackFile);
      appendFile(
        interfacePath,
        `#EXTINF:-1 tvg-id="${item.name}" tvg-name="${item.name}" tvg-logo="${item.pics.highResolutionH}" group-title="${datas[i]!.name}",${item.name}\n\${replace}/${item.pID}\n`,
      );
      appendFile(interfaceTXTPath, `${item.name},\${replace}/${item.pID}\n`);
    }
    printGreen(`Category ###: ${datas[i]!.name} updated!`);
  }

  appendFileSync(playbackFile, `</tv>\n`);
  renameFileSync(playbackFile, playbackFile.replace(".bak", ""));
  renameFileSync(interfacePath, interfacePath.replace(".bak", ""));
  renameFileSync(interfaceTXTPath, interfaceTXTPath.replace(".bak", ""));
  printGreen("TV update completed!");
  const end = Date.now();
  printYellow(`TV update took ${(end - start) / 1000}s`);
}

interface PEData {
  mgdbId: string;
  pkInfoTitle: string;
  competitionName: string;
  competitionLogo: string;
  confrontTeams?: Array<{ name: string }>;
}

interface PEResult {
  body?: {
    endTime?: number;
    keyword?: string;
    replayList?: Array<{ name: string; pID: string }>;
    multiPlayList?: {
      replayList?: Array<{ name: string; pID: string }>;
      liveList?: Array<{ name: string; pID: string; startTimeStr?: string }>;
      preList?: Array<{ startTimeStr?: string }>;
    };
    days?: string[];
    matchList?: Record<string, PEData[]>;
  };
}

/** Fetches sports match schedules (live + replay) and appends them to the playlist files. */
async function updatePE(_hours: number): Promise<void> {
  const start = Date.now();

  const datas = (await fetchUrl(
    "http://v0-sc.miguvideo.com/vms-match/v6/staticcache/basic/match-list/normal-match-list/0/all/default/1/miguvideo",
  )) as PEResult;
  printGreen("PE data fetched successfully!");

  copyFileSync(
    `${process.cwd()}/interface.txt`,
    `${process.cwd()}/interface.txt.bak`,
    0,
  );
  copyFileSync(
    `${process.cwd()}/interfaceTXT.txt`,
    `${process.cwd()}/interfaceTXT.txt.bak`,
    0,
  );

  const interfacePath = `${process.cwd()}/interface.txt.bak`;
  const interfaceTXTPath = `${process.cwd()}/interfaceTXT.txt.bak`;

  printYellow("Updating PE...");

  for (let i = 1; i < 4; i++) {
    const date = datas.body?.days?.[i];
    if (!date) continue;

    let relativeDate = "Yesterday";
    const dateString = getDateString(new Date());
    if (date === dateString) {
      relativeDate = "Today";
    } else if (parseInt(date) > parseInt(dateString)) {
      relativeDate = "Tomorrow";
    }

    appendFile(interfaceTXTPath, `Sports-${relativeDate},#genre#\n`);

    const matchList = datas.body?.matchList?.[date];
    if (!matchList) continue;

    for (const data of matchList) {
      let pkInfoTitle = data.pkInfoTitle;
      if (data.confrontTeams) {
        pkInfoTitle = `${data.confrontTeams[0]!.name}VS${data.confrontTeams[1]!.name}`;
      }
      const peResult = (await fetchUrl(
        `https://vms-sc.miguvideo.com/vms-match/v6/staticcache/basic/basic-data/${data.mgdbId}/miguvideo`,
      )) as PEResult;

      try {
        if ((peResult.body?.endTime ?? 0) < Date.now()) {
          const replayResult = (await fetchUrl(
            `http://app-sc.miguvideo.com/vms-match/v5/staticcache/basic/all-view-list/${data.mgdbId}/2/miguvideo`,
          )) as PEResult;
          const replayList =
            replayResult.body?.replayList ??
            peResult.body?.multiPlayList?.replayList;
          if (!replayList) {
            printYellow(`${data.mgdbId} ${pkInfoTitle} no replay available`);
            continue;
          }
          for (const replay of replayList) {
            if (replay.name.match(/.*集锦|训练.*/) !== null) {
              continue;
            }
            if (replay.name.match(/.*回放|赛.*/) !== null) {
              let timeStr = peResult.body?.keyword?.substring(7) ?? "";
              const preList = peResult.body?.multiPlayList?.preList;
              const peResultStartTimeStr =
                preList?.[preList.length - 1]?.startTimeStr;
              if (peResultStartTimeStr !== undefined) {
                timeStr = peResultStartTimeStr.substring(11, 16);
              }
              const competitionDesc = `${data.competitionName} ${pkInfoTitle} ${replay.name} ${timeStr}`;
              appendFileSync(
                interfacePath,
                `#EXTINF:-1 tvg-id="${pkInfoTitle}" tvg-name="${competitionDesc}" tvg-logo="${data.competitionLogo}" group-title="Sports-${relativeDate}",${competitionDesc}\n\${replace}/${replay.pID}\n`,
              );
              appendFileSync(
                interfaceTXTPath,
                `${competitionDesc},\${replace}/${replay.pID}\n`,
              );
            }
          }
          continue;
        }

        const liveList = peResult.body?.multiPlayList?.liveList;
        if (!liveList) continue;
        for (const live of liveList) {
          if (
            live.name.match(/.*集锦.*/) !== null ||
            live.startTimeStr === undefined
          ) {
            continue;
          }
          const competitionDesc = `${data.competitionName} ${pkInfoTitle} ${live.name} ${live.startTimeStr.substring(11, 16)}`;
          appendFileSync(
            interfacePath,
            `#EXTINF:-1 tvg-id="${pkInfoTitle}" tvg-name="${competitionDesc}" tvg-logo="${data.competitionLogo}" group-title="Sports-${relativeDate}",${competitionDesc}\n\${replace}/${live.pID}\n`,
          );
          appendFileSync(
            interfaceTXTPath,
            `${competitionDesc},\${replace}/${live.pID}\n`,
          );
        }
      } catch {
        printYellow(
          `${data.mgdbId} ${pkInfoTitle} update failed (non-critical, can be ignored)`,
        );
      }
    }
    printGreen(`Date ${date} updated!`);
  }

  renameFileSync(interfacePath, interfacePath.replace(".bak", ""));
  renameFileSync(interfaceTXTPath, interfaceTXTPath.replace(".bak", ""));
  printGreen("PE update completed!");
  const end = Date.now();
  printYellow(`PE update took ${(end - start) / 1000}s`);
}

/** Runs the full update cycle: TV channels first, then sports events. */
async function update(hours: number): Promise<void> {
  await updateTV(hours);
  await updatePE(hours);
}

export default update;
