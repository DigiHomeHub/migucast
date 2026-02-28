/**
 * Thin wrappers around Node.js `fs` operations.
 * Centralizes file I/O so callers don't depend on `fs` directly,
 * making external boundary mocking straightforward in tests.
 */
import fs from "node:fs";

/** Creates an empty file at `filePath` only if it does not already exist. */
function createFile(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    writeFile(filePath, "");
  }
}

function writeFile(filePath: string, content: string): void {
  fs.writeFile(filePath, content, (error) => {
    if (error) {
      throw new Error(`${filePath}: write failed`);
    }
  });
}

function appendFile(filePath: string, content: string): void {
  fs.appendFile(filePath, content, (error) => {
    if (error) {
      throw new Error(`${filePath}: append failed`);
    }
  });
}

function appendFileSync(filePath: string, content: string): void {
  fs.appendFileSync(filePath, content);
}

function readFileSync(filePath: string): Buffer {
  return fs.readFileSync(filePath);
}

function renameFileSync(oldFilePath: string, newFilePath: string): void {
  fs.renameSync(oldFilePath, newFilePath);
}

function copyFileSync(
  filePath: string,
  newFilePath: string,
  mode: number,
): void {
  fs.copyFileSync(filePath, newFilePath, mode);
}

export {
  createFile,
  writeFile,
  appendFile,
  appendFileSync,
  readFileSync,
  renameFileSync,
  copyFileSync,
};
