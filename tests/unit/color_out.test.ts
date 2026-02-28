import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/config.js", () => ({
  debug: true,
}));

vi.mock("../../src/utils/time.js", () => ({
  getLogDateTime: vi.fn(() => "2026-02-28 14:30:45:123"),
}));

import {
  printGreen,
  printBlue,
  printRed,
  printYellow,
  printMagenta,
  printGrey,
  printDebug,
} from "../../src/utils/color_out.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("color_out", () => {
  describe("basePrint color functions", () => {
    it("printRed outputs with red ANSI code", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      printRed("error message");
      expect(spy).toHaveBeenCalledWith(
        "\x1B[31m%s %s\x1B[0m",
        "[2026-02-28 14:30:45:123]",
        "error message",
      );
    });

    it("printGreen outputs with green ANSI code", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      printGreen("success");
      expect(spy).toHaveBeenCalledWith(
        "\x1B[32m%s %s\x1B[0m",
        "[2026-02-28 14:30:45:123]",
        "success",
      );
    });

    it("printYellow outputs with yellow ANSI code", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      printYellow("warning");
      expect(spy).toHaveBeenCalledWith(
        "\x1B[33m%s %s\x1B[0m",
        "[2026-02-28 14:30:45:123]",
        "warning",
      );
    });

    it("printBlue outputs with blue ANSI code", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      printBlue("info");
      expect(spy).toHaveBeenCalledWith(
        "\x1B[34m%s %s\x1B[0m",
        "[2026-02-28 14:30:45:123]",
        "info",
      );
    });

    it("printMagenta outputs with magenta ANSI code", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      printMagenta("magenta");
      expect(spy).toHaveBeenCalledWith(
        "\x1B[35m%s %s\x1B[0m",
        "[2026-02-28 14:30:45:123]",
        "magenta",
      );
    });

    it("printGrey outputs with dim ANSI code", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      printGrey("dim text");
      expect(spy).toHaveBeenCalledWith(
        "\x1B[2m%s %s\x1B[0m",
        "[2026-02-28 14:30:45:123]",
        "dim text",
      );
    });
  });

  describe("printDebug", () => {
    it("calls console.dir when debug is true", () => {
      const spy = vi.spyOn(console, "dir").mockImplementation(() => {});
      const obj = { key: "value" };
      printDebug(obj);
      expect(spy).toHaveBeenCalledWith(obj, { depth: null });
    });
  });
});
