import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "node:os";

vi.mock("../../src/config.js", () => ({
  debug: false,
}));

vi.mock("../../src/utils/time.js", () => ({
  getLogDateTime: vi.fn(() => "2026-01-01 00:00:00:000"),
}));

import { getLocalIPv, fetchUrl } from "../../src/utils/net.js";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("net", () => {
  describe("getLocalIPv", () => {
    it("returns IPv4 addresses by default", () => {
      vi.spyOn(os, "networkInterfaces").mockReturnValue({
        en0: [
          {
            address: "192.168.1.100",
            netmask: "255.255.255.0",
            family: "IPv4",
            mac: "00:00:00:00:00:00",
            internal: false,
            cidr: "192.168.1.100/24",
          },
          {
            address: "fe80::1",
            netmask: "ffff:ffff:ffff:ffff::",
            family: "IPv6",
            mac: "00:00:00:00:00:00",
            internal: false,
            cidr: "fe80::1/64",
            scopeid: 0,
          },
        ],
      });

      const ips = getLocalIPv();
      expect(ips).toEqual(["192.168.1.100"]);
    });

    it("returns IPv6 addresses when ver=6", () => {
      vi.spyOn(os, "networkInterfaces").mockReturnValue({
        en0: [
          {
            address: "192.168.1.100",
            netmask: "255.255.255.0",
            family: "IPv4",
            mac: "00:00:00:00:00:00",
            internal: false,
            cidr: "192.168.1.100/24",
          },
          {
            address: "fe80::1",
            netmask: "ffff:ffff:ffff:ffff::",
            family: "IPv6",
            mac: "00:00:00:00:00:00",
            internal: false,
            cidr: "fe80::1/64",
            scopeid: 0,
          },
        ],
      });

      const ips = getLocalIPv(6);
      expect(ips).toEqual(["fe80::1"]);
    });

    it("returns empty array when no interfaces match", () => {
      vi.spyOn(os, "networkInterfaces").mockReturnValue({});
      expect(getLocalIPv()).toEqual([]);
    });

    it("handles undefined interface entries", () => {
      vi.spyOn(os, "networkInterfaces").mockReturnValue({
        lo0: undefined,
      } as ReturnType<typeof os.networkInterfaces>);
      expect(getLocalIPv()).toEqual([]);
    });
  });

  describe("fetchUrl", () => {
    it("fetches JSON from URL", async () => {
      const mockData = { body: { result: "ok" } };
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        json: () => Promise.resolve(mockData),
      } as Response);

      const result = await fetchUrl("https://example.com/api");
      expect(result).toEqual(mockData);
    });

    it("returns undefined on network error", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network error"));

      const result = await fetchUrl("https://example.com/fail");
      expect(result).toBeUndefined();
    });

    it("passes custom options to fetch", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        json: () => Promise.resolve({}),
      } as Response);

      const headers = { Authorization: "Bearer token" };
      await fetchUrl("https://example.com/api", { headers });

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://example.com/api",
        expect.objectContaining({ headers }),
      );
    });

    it("aborts on timeout and returns undefined", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});

      vi.spyOn(globalThis, "fetch").mockImplementation((_url, opts) => {
        return new Promise((_resolve, reject) => {
          const signal = opts?.signal as AbortSignal | undefined;
          if (signal) {
            signal.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
          }
        });
      });

      const result = await fetchUrl("https://example.com/slow", {}, 50);
      expect(result).toBeUndefined();
    });
  });
});
