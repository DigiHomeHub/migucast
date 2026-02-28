function getDateString(date: Date): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

function getTimeString(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}${String(date.getSeconds()).padStart(2, "0")}`;
}

function getDateTimeString(date: Date): string {
  return `${getDateString(date)}${getTimeString(date)}`;
}

function getDateTimeStr(date: Date): string {
  return (
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ` +
    `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`
  );
}

function getLogDateTime(date: Date): string {
  return `${getDateTimeStr(date)}:${String(date.getMilliseconds()).padStart(3, "0")}`;
}

export { getDateString, getTimeString, getDateTimeString, getDateTimeStr, getLogDateTime };
