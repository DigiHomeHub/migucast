/**
 * Application entry point – HTTP server for live TV and sports streaming.
 * Routes incoming GET requests to either a playlist file response or a
 * 302 redirect to a resolved playback stream URL.
 * Runs a periodic background update cycle for channel data and EPG schedules.
 */
import http from "node:http";
import {
  config,
  host,
  pass,
  port,
  programInfoUpdateInterval,
  token,
  userId,
} from "./config.js";
import { getReadableDateTime } from "./utils/time.js";
import { updatePlaylistData } from "./utils/update_data.js";
import { setLoggerImpl } from "./logger.js";
import { logger } from "./logger.js";
import { channel, servePlaylist } from "./utils/request_handler.js";
import { initPlatform } from "./platform/context.js";
import {
  FileStorageAdapter,
  InMemoryCacheAdapter,
  TslogAdapter,
} from "./platform/node.js";

const PLAYLIST_ROUTES =
  "/,/interface.txt,/m3u,/txt,/epg.xml,/playlist.m3u,/playlist.txt";

export interface AuthResult {
  url: string;
  authenticated: boolean;
}

/**
 * Validates the authentication segment in the URL path.
 * Returns null if authentication fails, or the cleaned URL on success.
 */
export function extractAuthAndPath(
  url: string,
  authPass: string,
): AuthResult | null {
  if (authPass === "") {
    return { url, authenticated: true };
  }
  const urlSplit = url.split("/");
  if (urlSplit[1] !== authPass) {
    return null;
  }
  if (urlSplit.length > 3) {
    return { url: url.substring(authPass.length + 1), authenticated: true };
  }
  const cleaned =
    urlSplit.length === 2 ? "/" : "/" + (urlSplit[urlSplit.length - 1] ?? "");
  return { url: cleaned, authenticated: true };
}

export interface CredentialsResult {
  url: string;
  userId: string;
  token: string;
}

/**
 * Extracts userId/token from URL path segments when present,
 * otherwise falls back to default credentials.
 */
export function extractCredentials(
  url: string,
  defaultUserId: string,
  defaultToken: string,
): CredentialsResult {
  if (/\/{1}[^/\s]{1,}\/{1}[^/\s]{1,}/.test(url)) {
    const urlSplit = url.split("/");
    if (urlSplit.length >= 3) {
      const extractedUrl =
        urlSplit.length === 3
          ? "/"
          : "/" + (urlSplit[urlSplit.length - 1] ?? "");
      return {
        url: extractedUrl,
        userId: urlSplit[1] ?? "",
        token: urlSplit[2] ?? "",
      };
    }
  }
  return { url, userId: defaultUserId, token: defaultToken };
}

/** Creates an HTTP request listener that routes to playlist/channel handlers. */
export function createRequestHandler(deps: {
  pass: string;
  userId: string;
  token: string;
}): http.RequestListener {
  return (req, res) => {
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

        const authResult = extractAuthAndPath(url, deps.pass);
        if (!authResult) {
          logger.error("Authentication failed");
          res.writeHead(200, {
            "Content-Type": "application/json;charset=UTF-8",
          });
          res.end("Authentication failed");
          return;
        }
        if (deps.pass !== "") {
          logger.info("Authentication successful");
        }
        url = authResult.url;

        const creds = extractCredentials(url, deps.userId, deps.token);
        url = creds.url;
        const urlUserId = creds.userId;
        const urlToken = creds.token;

        logger.info("Request URL: " + url);

        if (method !== "GET") {
          res.writeHead(200, {
            "Content-Type": "application/json;charset=UTF-8",
          });
          res.end(JSON.stringify({ data: "Please use GET request" }));
          logger.error(`Non-GET request received: ${method}`);
          return;
        }

        if (PLAYLIST_ROUTES.indexOf(url) !== -1) {
          const genericHeaders: Record<string, string | undefined> = {};
          for (const [key, value] of Object.entries(headers)) {
            genericHeaders[key] = Array.isArray(value)
              ? value.join(", ")
              : value;
          }
          const playlistResult = await servePlaylist(
            url,
            genericHeaders,
            urlUserId,
            urlToken,
          );
          if (playlistResult.content === null) {
            playlistResult.content = "Fetch failed";
          }
          res.setHeader("Content-Type", playlistResult.contentType);
          if (url === "/m3u" || url === "/playlist.m3u") {
            res.setHeader(
              "content-disposition",
              'inline; filename="playlist.m3u"',
            );
          }
          res.statusCode = 200;
          res.end(playlistResult.content);
          return;
        }

        const result = await channel(url, urlUserId, urlToken);

        if (result.code !== 302) {
          logger.error(result.desc);
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
        logger.error(error);
        logger.error("Unhandled request error");
        if (!res.headersSent) {
          res.writeHead(500, {
            "Content-Type": "application/json;charset=UTF-8",
          });
          res.end("Internal server error");
        }
      }
    })();
  };
}

/** Bootstraps platform adapters, creates HTTP server, starts periodic updates. */
export function startServer(): http.Server {
  const tslogAdapter = new TslogAdapter({
    logLevel: config.logLevel,
    logFile: config.logFile,
    isProduction: process.env.NODE_ENV === "production",
  });
  setLoggerImpl(tslogAdapter);

  initPlatform({
    storage: new FileStorageAdapter(config.dataDir),
    cache: new InMemoryCacheAdapter(),
    logger: tslogAdapter,
  });

  let hours = 0;
  const handler = createRequestHandler({ pass, userId, token });
  const server = http.createServer(handler);

  server.listen(port, () => {
    const updateInterval = programInfoUpdateInterval;

    setInterval(
      () => {
        void (async () => {
          logger.info(
            `Preparing file update ${getReadableDateTime(new Date())}`,
          );
          hours += updateInterval;
          try {
            await updatePlaylistData(hours);
          } catch (error) {
            logger.error(error);
            logger.error("Update failed");
          }
          logger.info(`Running for ${hours} hours`);
        })();
      },
      updateInterval * 60 * 60 * 1000,
    );

    void (async () => {
      try {
        await updatePlaylistData(hours);
      } catch (error) {
        logger.error(error);
        logger.error("Update failed");
      }
    })();

    logger.info(
      `Local address: http://localhost:${port}${pass === "" ? "" : "/" + pass}`,
    );
    logger.info(
      "This software is completely free. If you paid for it, you've been scammed.",
    );
    logger.info(
      "Open source: https://github.com/develop202/migu_video Issues welcome, stars appreciated",
    );
    if (host !== "") {
      logger.info(`Custom address: ${host}${pass === "" ? "" : "/" + pass}`);
    }
  });

  return server;
}

// Auto-start when run as Node.js entry point (not during test imports)
const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("/app.js") || process.argv[1].endsWith("/app.ts"));

if (isDirectRun) {
  startServer();
}
