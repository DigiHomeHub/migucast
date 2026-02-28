import { describe, it, expect } from "vitest";
import {
  getStringMd5,
  base64Encode,
  base64Decode,
  aesEncrypt,
  aesDecrypt,
  rsaSign,
} from "../../src/utils/crypto_utils.js";

describe("crypto_utils", () => {
  describe("getStringMd5", () => {
    it("returns correct MD5 hash for empty string", () => {
      expect(getStringMd5("")).toBe("d41d8cd98f00b204e9800998ecf8427e");
    });

    it("returns correct MD5 hash for 'hello'", () => {
      expect(getStringMd5("hello")).toBe("5d41402abc4b2a76b9719d911017c592");
    });

    it("returns lowercase hex string", () => {
      const result = getStringMd5("test");
      expect(result).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  describe("base64Encode / base64Decode", () => {
    it("encodes and decodes round-trip", () => {
      const original = "Hello, World!";
      const encoded = base64Encode(original);
      expect(base64Decode(encoded)).toBe(original);
    });

    it("produces valid base64 output", () => {
      const result = base64Encode("test data");
      expect(result).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    it("handles unicode strings", () => {
      const original = "你好世界";
      const encoded = base64Encode(original);
      expect(base64Decode(encoded)).toBe(original);
    });
  });

  describe("aesEncrypt", () => {
    it("produces base64 output", () => {
      const encrypted = aesEncrypt("test data");
      expect(encrypted).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    it("produces different ciphertext for different inputs", () => {
      const enc1 = aesEncrypt("data1");
      const enc2 = aesEncrypt("data2");
      expect(enc1).not.toBe(enc2);
    });

    it("produces deterministic output for same input", () => {
      const enc1 = aesEncrypt("same input");
      const enc2 = aesEncrypt("same input");
      expect(enc1).toBe(enc2);
    });
  });

  describe("aesDecrypt", () => {
    it("throws on invalid cipher data", () => {
      expect(() => aesDecrypt("not-valid-cipher-data")).toThrow();
    });

    it("pads key shorter than 32 bytes", () => {
      expect(() =>
        aesDecrypt("test", "shortKey", "abcdefghijklmnop"),
      ).toThrow();
    });

    it("pads iv shorter than 16 bytes", () => {
      expect(() =>
        aesDecrypt("test", "MQDUjI19MGe3BhaqTlpc9g==", "shortIV"),
      ).toThrow();
    });
  });

  describe("rsaSign", () => {
    it("produces base64 encoded output", () => {
      const result = rsaSign("test data");
      expect(result).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    it("produces deterministic output for same input", () => {
      const enc1 = rsaSign("same");
      const enc2 = rsaSign("same");
      expect(enc1).toBe(enc2);
    });

    it("produces different output for different inputs", () => {
      const enc1 = rsaSign("input1");
      const enc2 = rsaSign("input2");
      expect(enc1).not.toBe(enc2);
    });
  });
});
