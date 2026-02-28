import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import {
  createFile,
  writeFile,
  appendFile,
  appendFileSync,
  readFileSync,
  renameFileSync,
  copyFileSync,
} from "../../src/utils/file_util.js";

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    writeFile: vi.fn(),
    appendFile: vi.fn(),
    appendFileSync: vi.fn(),
    readFileSync: vi.fn(),
    renameSync: vi.fn(),
    copyFileSync: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("file_util", () => {
  describe("createFile", () => {
    it("creates file when it does not exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.writeFile).mockImplementation((_p, _c, cb) => cb(null));

      createFile("/tmp/test.txt");

      expect(fs.existsSync).toHaveBeenCalledWith("/tmp/test.txt");
      expect(fs.writeFile).toHaveBeenCalledWith(
        "/tmp/test.txt",
        "",
        expect.any(Function),
      );
    });

    it("skips creation when file already exists", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      createFile("/tmp/test.txt");

      expect(fs.existsSync).toHaveBeenCalledWith("/tmp/test.txt");
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe("writeFile", () => {
    it("writes content to file", () => {
      vi.mocked(fs.writeFile).mockImplementation((_p, _c, cb) => cb(null));

      writeFile("/tmp/test.txt", "hello");

      expect(fs.writeFile).toHaveBeenCalledWith(
        "/tmp/test.txt",
        "hello",
        expect.any(Function),
      );
    });

    it("throws on write error", () => {
      vi.mocked(fs.writeFile).mockImplementation((_p, _c, cb) =>
        cb(new Error("disk full")),
      );

      expect(() => writeFile("/tmp/test.txt", "hello")).toThrow(
        "/tmp/test.txt: write failed",
      );
    });
  });

  describe("appendFile", () => {
    it("appends content to file", () => {
      vi.mocked(fs.appendFile).mockImplementation((_p, _c, cb) => cb(null));

      appendFile("/tmp/test.txt", "more");

      expect(fs.appendFile).toHaveBeenCalledWith(
        "/tmp/test.txt",
        "more",
        expect.any(Function),
      );
    });

    it("throws on append error", () => {
      vi.mocked(fs.appendFile).mockImplementation((_p, _c, cb) =>
        cb(new Error("fail")),
      );

      expect(() => appendFile("/tmp/test.txt", "more")).toThrow(
        "/tmp/test.txt: append failed",
      );
    });
  });

  describe("appendFileSync", () => {
    it("delegates to fs.appendFileSync", () => {
      appendFileSync("/tmp/test.txt", "sync data");

      expect(fs.appendFileSync).toHaveBeenCalledWith(
        "/tmp/test.txt",
        "sync data",
      );
    });
  });

  describe("readFileSync", () => {
    it("delegates to fs.readFileSync", () => {
      const mockBuffer = Buffer.from("file content");
      vi.mocked(fs.readFileSync).mockReturnValue(mockBuffer);

      const result = readFileSync("/tmp/test.txt");

      expect(fs.readFileSync).toHaveBeenCalledWith("/tmp/test.txt");
      expect(result).toBe(mockBuffer);
    });
  });

  describe("renameFileSync", () => {
    it("delegates to fs.renameSync", () => {
      renameFileSync("/tmp/old.txt", "/tmp/new.txt");

      expect(fs.renameSync).toHaveBeenCalledWith(
        "/tmp/old.txt",
        "/tmp/new.txt",
      );
    });
  });

  describe("copyFileSync", () => {
    it("delegates to fs.copyFileSync", () => {
      copyFileSync("/tmp/src.txt", "/tmp/dst.txt", 0);

      expect(fs.copyFileSync).toHaveBeenCalledWith(
        "/tmp/src.txt",
        "/tmp/dst.txt",
        0,
      );
    });
  });
});
