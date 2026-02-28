/**
 * ANSI-colored console output with automatic timestamp prefixing.
 * Every log line is formatted as `[YYYY-MM-DD HH:mm:ss:mmm] message` in the chosen color.
 */
import { debug } from "../config.js";
import { getLogDateTime } from "./time.js";

/** Prints a timestamped message wrapped in the given ANSI color escape code. */
function basePrint(color: string, msg: string): void {
  console.log(`${color}%s %s\x1B[0m`, `[${getLogDateTime(new Date())}]`, msg);
}

function printRed(msg: string): void {
  basePrint("\x1B[31m", msg);
}

function printGreen(msg: string): void {
  basePrint("\x1B[32m", msg);
}

function printYellow(msg: string): void {
  basePrint("\x1B[33m", msg);
}

function printBlue(msg: string): void {
  basePrint("\x1B[34m", msg);
}

function printMagenta(msg: string): void {
  basePrint("\x1B[35m", msg);
}

function printGrey(msg: string): void {
  basePrint("\x1B[2m", msg);
}

/** Deep-prints an object via `console.dir` when debug mode is enabled. */
function printDebug(obj: unknown): void {
  if (debug) {
    console.dir(obj, { depth: null });
  }
}

export {
  printGreen,
  printBlue,
  printRed,
  printYellow,
  printMagenta,
  printGrey,
  printDebug,
};
