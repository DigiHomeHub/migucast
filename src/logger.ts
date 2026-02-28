/**
 * Centralized logging module built on tslog.
 * Automatically switches between Pretty (dev) and JSON (prod) output modes.
 * Optionally writes structured JSON lines to a log file when `logFile` is configured.
 */
import { Logger, type ILogObj } from "tslog";
import fs from "node:fs";
import { logLevel, logFile } from "./config.js";

type LogLevelName =
  | "silly"
  | "trace"
  | "debug"
  | "info"
  | "warn"
  | "error"
  | "fatal";

const LOG_LEVEL_MAP: Record<LogLevelName, number> = {
  silly: 0,
  trace: 1,
  debug: 2,
  info: 3,
  warn: 4,
  error: 5,
  fatal: 6,
};

export const logger: Logger<ILogObj> = new Logger({
  name: "migucast",
  minLevel: LOG_LEVEL_MAP[logLevel],
  type: process.env.NODE_ENV === "production" ? "json" : "pretty",
});

if (logFile) {
  const logStream = fs.createWriteStream(logFile, { flags: "a" });
  logger.attachTransport((logObj: ILogObj) => {
    logStream.write(JSON.stringify(logObj) + "\n");
  });
}
