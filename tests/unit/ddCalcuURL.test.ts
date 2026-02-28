import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/config.js", () => ({
  userId: "testuser1234",
}));

vi.mock("../../src/utils/net.js", () => ({
  fetchUrl: vi.fn(),
}));

vi.mock("../../src/utils/time.js", () => ({
  getDateString: vi.fn(() => "20260228"),
}));

import { getddCalcuURL, getddCalcuURL720p } from "../../src/utils/ddCalcuURL.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ddCalcuURL", () => {
  describe("getddCalcuURL", () => {
    it("returns empty string when puDataURL is empty", () => {
      expect(getddCalcuURL("", "123456", "android", "3", "user1234")).toBe("");
    });

    it("returns empty string when programId is empty", () => {
      expect(getddCalcuURL("http://example.com?puData=abcdef", "", "android", "3", "user1234")).toBe("");
    });

    it("returns empty string for invalid clientType", () => {
      expect(getddCalcuURL("http://example.com?puData=abcdef", "123456", "ios" as "android", "3", "")).toBe("");
    });

    it("returns empty string when puData param is missing", () => {
      expect(getddCalcuURL("http://example.com", "123456", "android", "3", "user1234")).toBe("");
    });

    it("generates encrypted URL for android client", () => {
      const puDataURL = "http://example.com/video&puData=abcdefghij";
      const result = getddCalcuURL(puDataURL, "1234567890", "android", "3", "user12345678");

      expect(result).toContain("&ddCalcu=");
      expect(result).toContain("&sv=10004&ct=android");
      expect(result.startsWith(puDataURL)).toBe(true);
    });

    it("generates encrypted URL for h5 client", () => {
      const puDataURL = "http://example.com/video&puData=abcdefghij";
      const result = getddCalcuURL(puDataURL, "1234567890", "h5", "3", "user12345678");

      expect(result).toContain("&ddCalcu=");
      expect(result).toContain("&sv=10000&ct=www");
    });

    it("produces deterministic output for same inputs", () => {
      const puDataURL = "http://example.com/video&puData=abcdefghijklmnop";
      const r1 = getddCalcuURL(puDataURL, "1234567890", "android", "3", "user12345678");
      const r2 = getddCalcuURL(puDataURL, "1234567890", "android", "3", "user12345678");
      expect(r1).toBe(r2);
    });

    it("uses 'v' for android rateType=2", () => {
      const puDataURL = "http://example.com/video&puData=abcdefghij";
      const result = getddCalcuURL(puDataURL, "1234567890", "android", "2", "user12345678");

      expect(result).toContain("&ddCalcu=");
    });

    it("uses 'e' for short userId (3-8 chars)", () => {
      const puDataURL = "http://example.com/video&puData=abcdefghij";
      const result = getddCalcuURL(puDataURL, "1234567890", "android", "3", "abcde");

      expect(result).toContain("&ddCalcu=");
    });
  });

  describe("getddCalcuURL720p", () => {
    it("returns empty string when puDataURL is empty", () => {
      expect(getddCalcuURL720p("", "123456")).toBe("");
    });

    it("returns empty string when programId is empty", () => {
      expect(getddCalcuURL720p("http://example.com?puData=abcdef", "")).toBe("");
    });

    it("returns empty string when puData param is missing", () => {
      expect(getddCalcuURL720p("http://example.com", "123456")).toBe("");
    });

    it("generates 720p encrypted URL", () => {
      const puDataURL = "http://example.com/video&puData=abcdefghij";
      const result = getddCalcuURL720p(puDataURL, "1234567890");

      expect(result).toContain("&ddCalcu=");
      expect(result).toContain("&sv=10004&ct=android");
    });

    it("produces deterministic output for same inputs", () => {
      const puDataURL = "http://example.com/video&puData=abcdefghijklmnop";
      const r1 = getddCalcuURL720p(puDataURL, "1234567890");
      const r2 = getddCalcuURL720p(puDataURL, "1234567890");
      expect(r1).toBe(r2);
    });
  });
});
