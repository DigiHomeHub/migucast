import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import { gzipSync } from "node:zlib";

vi.mock("../../src/config.js", () => ({
  debug: false,
  logLevel: "info",
  logFile: undefined,
}));

vi.mock("../../src/utils/time.js", () => ({
  getLogDateTime: vi.fn(() => "2026-01-01 00:00:00:000"),
}));

vi.mock("../../src/utils/static_data.js", () => ({
  domainWhiteList: ["example.com"],
  repoLinkUpdateTimestamp: 999,
}));

vi.mock("../../src/utils/file_util.js", () => ({
  readFileSync: vi.fn(() =>
    Buffer.from("const repoLinkUpdateTimestamp = 999;"),
  ),
}));

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
  writeFileSync: vi.fn(),
}));

function aes128cbcEncrypt(plaintext: string): string {
  const keyArr = [
    121, 111, 117, 33, 106, 101, 64, 49, 57, 114, 114, 36, 50, 48, 121, 35,
  ];
  const ivArr = [
    65, 114, 101, 121, 111, 117, 124, 62, 127, 110, 54, 38, 13, 97, 110, 63,
  ];
  const key = Buffer.from(keyArr);
  const iv = Buffer.from(ivArr);
  const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
  cipher.setAutoPadding(true);
  return Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]).toString("base64");
}

import { writeFileSync } from "node:fs";
import updateChannels from "../../src/utils/zbpro.js";

const mockWriteFileSync = vi.mocked(writeFileSync);

beforeEach(() => {
  vi.clearAllMocks();
});

function makeGzPayload(data: unknown): ArrayBuffer {
  const compressed = gzipSync(JSON.stringify(data));
  return compressed.buffer.slice(
    compressed.byteOffset,
    compressed.byteOffset + compressed.byteLength,
  );
}

describe("zbpro", () => {
  describe("updateChannels", () => {
    it("returns 2 when remote fetch fails", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
      } as Response);
      vi.spyOn(console, "log").mockImplementation(() => {});

      const result = await updateChannels();
      expect(result).toBe(2);
    });

    it("returns 1 when timestamp matches (no update needed)", async () => {
      const buf = makeGzPayload({ timestamp: 999, data: [] });

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(buf),
      } as Response);
      vi.spyOn(console, "log").mockImplementation(() => {});

      const result = await updateChannels();
      expect(result).toBe(1);
    });

    it("processes channels and writes files on new timestamp", async () => {
      const encryptedURL = aes128cbcEncrypt("http://example.com/live");
      const buf = makeGzPayload({
        timestamp: 1000,
        data: [
          {
            title: "Test-Channel",
            province: "Local",
            urls: [encryptedURL],
          },
        ],
      });

      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(buf),
        } as Response)
        .mockResolvedValue({ ok: true } as Response);

      vi.spyOn(console, "log").mockImplementation(() => {});

      const result = await updateChannels();

      expect(result).toBe(0);
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it("skips channels with ct property", async () => {
      const buf = makeGzPayload({
        timestamp: 2000,
        data: [
          {
            title: "Paid-Channel",
            province: "National",
            ct: true,
            urls: ["abc"],
          },
        ],
      });

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(buf),
      } as Response);
      vi.spyOn(console, "log").mockImplementation(() => {});

      const result = await updateChannels();
      expect(result).toBe(0);
    });
  });
});
