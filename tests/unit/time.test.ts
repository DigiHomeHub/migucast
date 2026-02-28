import { describe, it, expect } from "vitest";
import {
  getDateString,
  getTimeString,
  getCompactDateTime,
  getReadableDateTime,
  getLogDateTime,
} from "../../src/utils/time.js";

describe("time utilities", () => {
  const fixedDate = new Date(2026, 1, 28, 14, 30, 45, 123);

  describe("getDateString", () => {
    it("formats date as YYYYMMDD", () => {
      expect(getDateString(fixedDate)).toBe("20260228");
    });

    it("pads single-digit month", () => {
      const jan = new Date(2026, 0, 5);
      expect(getDateString(jan)).toBe("20260105");
    });
  });

  describe("getTimeString", () => {
    it("formats time as HHmmss", () => {
      expect(getTimeString(fixedDate)).toBe("143045");
    });

    it("pads single-digit hours", () => {
      const early = new Date(2026, 0, 1, 3, 5, 9);
      expect(getTimeString(early)).toBe("030509");
    });
  });

  describe("getCompactDateTime", () => {
    it("concatenates date and time strings", () => {
      expect(getCompactDateTime(fixedDate)).toBe("20260228143045");
    });
  });

  describe("getReadableDateTime", () => {
    it("formats as YYYY-MM-DD HH:mm:ss", () => {
      expect(getReadableDateTime(fixedDate)).toBe("2026-02-28 14:30:45");
    });
  });

  describe("getLogDateTime", () => {
    it("formats as YYYY-MM-DD HH:mm:ss:mmm", () => {
      expect(getLogDateTime(fixedDate)).toBe("2026-02-28 14:30:45:123");
    });

    it("pads milliseconds with leading zeros", () => {
      const lowMs = new Date(2026, 0, 1, 0, 0, 0, 7);
      expect(getLogDateTime(lowMs)).toMatch(/:007$/);
    });
  });
});
