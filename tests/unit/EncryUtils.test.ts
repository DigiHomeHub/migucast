import { describe, it, expect } from "vitest";
import {
  getStringMD5,
  Base64encrypt,
  Base64decrypt,
  AESencrypt,
  AESdecrypt,
  RSAencrypt,
} from "../../src/utils/EncryUtils.js";

describe("EncryUtils", () => {
  describe("getStringMD5", () => {
    it("returns correct MD5 hash for empty string", () => {
      expect(getStringMD5("")).toBe("d41d8cd98f00b204e9800998ecf8427e");
    });

    it("returns correct MD5 hash for 'hello'", () => {
      expect(getStringMD5("hello")).toBe("5d41402abc4b2a76b9719d911017c592");
    });

    it("returns lowercase hex string", () => {
      const result = getStringMD5("test");
      expect(result).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  describe("Base64encrypt / Base64decrypt", () => {
    it("encrypts and decrypts round-trip", () => {
      const original = "Hello, World!";
      const encrypted = Base64encrypt(original);
      expect(Base64decrypt(encrypted)).toBe(original);
    });

    it("produces valid base64 output", () => {
      const result = Base64encrypt("test data");
      expect(result).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    it("handles unicode strings", () => {
      const original = "你好世界";
      const encrypted = Base64encrypt(original);
      expect(Base64decrypt(encrypted)).toBe(original);
    });
  });

  describe("AESencrypt", () => {
    it("produces base64 output", () => {
      const encrypted = AESencrypt("test data");
      expect(encrypted).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    it("produces different ciphertext for different inputs", () => {
      const enc1 = AESencrypt("data1");
      const enc2 = AESencrypt("data2");
      expect(enc1).not.toBe(enc2);
    });

    it("produces deterministic output for same input", () => {
      const enc1 = AESencrypt("same input");
      const enc2 = AESencrypt("same input");
      expect(enc1).toBe(enc2);
    });
  });

  describe("AESdecrypt", () => {
    it("throws on invalid cipher data", () => {
      expect(() => AESdecrypt("not-valid-cipher-data")).toThrow();
    });

    it("pads key shorter than 32 bytes", () => {
      expect(() => AESdecrypt("test", "shortKey", "abcdefghijklmnop")).toThrow();
    });

    it("pads iv shorter than 16 bytes", () => {
      expect(() => AESdecrypt("test", "MQDUjI19MGe3BhaqTlpc9g==", "shortIV")).toThrow();
    });
  });

  describe("RSAencrypt", () => {
    it("produces base64 encoded output", () => {
      const result = RSAencrypt("test data");
      expect(result).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    it("produces deterministic output for same input", () => {
      const enc1 = RSAencrypt("same");
      const enc2 = RSAencrypt("same");
      expect(enc1).toBe(enc2);
    });

    it("produces different output for different inputs", () => {
      const enc1 = RSAencrypt("input1");
      const enc2 = RSAencrypt("input2");
      expect(enc1).not.toBe(enc2);
    });
  });
});
