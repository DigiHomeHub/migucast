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

import {
  getDdCalcuUrl,
  getDdCalcuUrl720p,
} from "../../src/utils/dd_calcu_url.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dd_calcu_url", () => {
  describe("getDdCalcuUrl", () => {
    it("returns empty string when puDataUrl is empty", () => {
      expect(getDdCalcuUrl("", "123456", "android", "3", "user1234")).toBe("");
    });

    it("returns empty string when programId is empty", () => {
      expect(
        getDdCalcuUrl(
          "http://example.com?puData=abcdef",
          "",
          "android",
          "3",
          "user1234",
        ),
      ).toBe("");
    });

    it("returns empty string for invalid clientType", () => {
      expect(
        getDdCalcuUrl(
          "http://example.com?puData=abcdef",
          "123456",
          "ios" as "android",
          "3",
          "",
        ),
      ).toBe("");
    });

    it("returns empty string when puData param is missing", () => {
      expect(
        getDdCalcuUrl(
          "http://example.com",
          "123456",
          "android",
          "3",
          "user1234",
        ),
      ).toBe("");
    });

    it("generates encrypted URL for android client", () => {
      const puDataUrl = "http://example.com/video&puData=abcdefghij";
      const result = getDdCalcuUrl(
        puDataUrl,
        "1234567890",
        "android",
        "3",
        "user12345678",
      );

      expect(result).toContain("&ddCalcu=");
      expect(result).toContain("&sv=10004&ct=android");
      expect(result.startsWith(puDataUrl)).toBe(true);
    });

    it("generates encrypted URL for h5 client", () => {
      const puDataUrl = "http://example.com/video&puData=abcdefghij";
      const result = getDdCalcuUrl(
        puDataUrl,
        "1234567890",
        "h5",
        "3",
        "user12345678",
      );

      expect(result).toContain("&ddCalcu=");
      expect(result).toContain("&sv=10000&ct=www");
    });

    it("produces deterministic output for same inputs", () => {
      const puDataUrl = "http://example.com/video&puData=abcdefghijklmnop";
      const r1 = getDdCalcuUrl(
        puDataUrl,
        "1234567890",
        "android",
        "3",
        "user12345678",
      );
      const r2 = getDdCalcuUrl(
        puDataUrl,
        "1234567890",
        "android",
        "3",
        "user12345678",
      );
      expect(r1).toBe(r2);
    });

    it("uses 'v' for android rateType=2", () => {
      const puDataUrl = "http://example.com/video&puData=abcdefghij";
      const result = getDdCalcuUrl(
        puDataUrl,
        "1234567890",
        "android",
        "2",
        "user12345678",
      );

      expect(result).toContain("&ddCalcu=");
    });

    it("uses 'e' for short userId (3-8 chars)", () => {
      const puDataUrl = "http://example.com/video&puData=abcdefghij";
      const result = getDdCalcuUrl(
        puDataUrl,
        "1234567890",
        "android",
        "3",
        "abcde",
      );

      expect(result).toContain("&ddCalcu=");
    });
  });

  describe("getDdCalcuUrl720p", () => {
    it("returns empty string when puDataUrl is empty", () => {
      expect(getDdCalcuUrl720p("", "123456")).toBe("");
    });

    it("returns empty string when programId is empty", () => {
      expect(getDdCalcuUrl720p("http://example.com?puData=abcdef", "")).toBe(
        "",
      );
    });

    it("returns empty string when puData param is missing", () => {
      expect(getDdCalcuUrl720p("http://example.com", "123456")).toBe("");
    });

    it("generates 720p encrypted URL", () => {
      const puDataUrl = "http://example.com/video&puData=abcdefghij";
      const result = getDdCalcuUrl720p(puDataUrl, "1234567890");

      expect(result).toContain("&ddCalcu=");
      expect(result).toContain("&sv=10004&ct=android");
    });

    it("produces deterministic output for same inputs", () => {
      const puDataUrl = "http://example.com/video&puData=abcdefghijklmnop";
      const r1 = getDdCalcuUrl720p(puDataUrl, "1234567890");
      const r2 = getDdCalcuUrl720p(puDataUrl, "1234567890");
      expect(r1).toBe(r2);
    });
  });
});
