/**
 * Date and time formatting utilities.
 * Provides compact string representations for filenames, logs, and API parameters.
 */

/** Formats a Date as `YYYYMMDD` (e.g. "20260228"). */
function getDateString(date: Date): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

/** Formats a Date as `HHmmss` (e.g. "143045"). */
function getTimeString(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}${String(date.getSeconds()).padStart(2, "0")}`;
}

/** Formats a Date as `YYYYMMDDHHmmss` for API timestamp parameters. */
function getCompactDateTime(date: Date): string {
  return `${getDateString(date)}${getTimeString(date)}`;
}

/** Formats a Date as `YYYY-MM-DD HH:mm:ss` for human-readable display. */
function getReadableDateTime(date: Date): string {
  return (
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ` +
    `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`
  );
}

export {
  getDateString,
  getTimeString,
  getCompactDateTime,
  getReadableDateTime,
};
