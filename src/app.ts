/**
 * Application entry point – HTTP server for live TV and sports streaming.
 * Routes incoming GET requests to either a playlist file response or a
 * 302 redirect to a resolved playback stream URL.
 * Runs a periodic background update cycle for channel data and EPG schedules.
 */
import http from "node:http";
import {
  host,
  pass,
  port,
  programInfoUpdateInterval,
  token,
  userId,
} from "./config.js";
import { getReadableDateTime } from "./utils/time.js";
import { updatePlaylistData } from "./utils/update_data.js";
import {
  printBlue,
  printGreen,
  printMagenta,
  printRed,
} from "./utils/color_out.js";
import { channel, servePlaylist } from "./utils/request_handler.js";

let hours = 0;

const server = http.createServer((req, res) => {
  void (async () => {
    try {
      const { method, headers } = req;
      let { url } = req;
      if (!url) {
        res.writeHead(400, {
          "Content-Type": "application/json;charset=UTF-8",
        });
        res.end("Request URL is empty");
        return;
      }

      if (url === "/favicon.ico") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (pass !== "") {
        const urlSplit = url.split("/");
        if (urlSplit[1] !== pass) {
          printRed("Authentication failed");
          res.writeHead(200, {
            "Content-Type": "application/json;charset=UTF-8",
          });
          res.end("Authentication failed");
          return;
        } else {
          printGreen("Authentication successful");
          if (urlSplit.length > 3) {
            url = url.substring(pass.length + 1);
          } else {
            url =
              urlSplit.length === 2
                ? "/"
                : "/" + (urlSplit[urlSplit.length - 1] ?? "");
          }
        }
      }

      let urlToken = "";
      let urlUserId = "";

      if (/\/{1}[^/\s]{1,}\/{1}[^/\s]{1,}/.test(url)) {
        const urlSplit = url.split("/");
        if (urlSplit.length >= 3) {
          urlUserId = urlSplit[1] ?? "";
          urlToken = urlSplit[2] ?? "";
          url =
            urlSplit.length === 3
              ? "/"
              : "/" + (urlSplit[urlSplit.length - 1] ?? "");
        }
      } else {
        urlUserId = userId;
        urlToken = token;
      }

      printMagenta("Request URL: " + url);

      if (method !== "GET") {
        res.writeHead(200, {
          "Content-Type": "application/json;charset=UTF-8",
        });
        res.end(JSON.stringify({ data: "Please use GET request" }));
        printRed(`Non-GET request received: ${method}`);
        return;
      }

      const interfaceList = "/,/interface.txt,/m3u,/txt,/epg.xml";

      if (interfaceList.indexOf(url) !== -1) {
        const interfaceObj = servePlaylist(url, headers, urlUserId, urlToken);
        if (interfaceObj.content === null) {
          interfaceObj.content = "Fetch failed";
        }
        res.setHeader("Content-Type", interfaceObj.contentType);
        if (url === "/m3u") {
          res.setHeader(
            "content-disposition",
            'inline; filename="interface.m3u"',
          );
        }
        res.statusCode = 200;
        res.end(interfaceObj.content);
        return;
      }

      const result = await channel(url, urlUserId, urlToken);

      if (result.code !== 302) {
        printRed(result.desc);
        res.writeHead(result.code, {
          "Content-Type": "application/json;charset=UTF-8",
        });
        res.end(result.desc);
        return;
      }

      res.writeHead(result.code, {
        "Content-Type": "application/json;charset=UTF-8",
        location: result.playUrl,
      });
      res.end();
    } catch (error) {
      console.log(error);
      printRed("Unhandled request error");
      if (!res.headersSent) {
        res.writeHead(500, {
          "Content-Type": "application/json;charset=UTF-8",
        });
        res.end("Internal server error");
      }
    }
  })();
});

server.listen(port, () => {
  const updateInterval = programInfoUpdateInterval;

  setInterval(
    () => {
      void (async () => {
        printBlue(`Preparing file update ${getReadableDateTime(new Date())}`);
        hours += updateInterval;
        try {
          await updatePlaylistData(hours);
        } catch (error) {
          console.log(error);
          printRed("Update failed");
        }
        printBlue(`Running for ${hours} hours`);
      })();
    },
    updateInterval * 60 * 60 * 1000,
  );

  void (async () => {
    try {
      await updatePlaylistData(hours);
    } catch (error) {
      console.log(error);
      printRed("Update failed");
    }
  })();

  printGreen(
    `Local address: http://localhost:${port}${pass === "" ? "" : "/" + pass}`,
  );
  printGreen(
    "This software is completely free. If you paid for it, you've been scammed.",
  );
  printGreen(
    "Open source: https://github.com/develop202/migu_video Issues welcome, stars appreciated",
  );
  if (host !== "") {
    printGreen(`Custom address: ${host}${pass === "" ? "" : "/" + pass}`);
  }
});
