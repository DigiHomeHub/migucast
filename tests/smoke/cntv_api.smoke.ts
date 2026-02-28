/**
 * Smoke test for CNTV (China Network Television) EPG API.
 * Hits the real API and validates the response against the Zod schema.
 *
 * Usage: pnpm test:smoke
 */
import { describe, it, expect } from "vitest";
import { fetchUrl } from "../../src/utils/net.js";
import { CntvEpgResponseSchema } from "../../src/api/schemas.js";

const SMOKE_TIMEOUT = 15_000;

describe("CNTV API smoke tests", () => {
  it(
    "fetchCntvEpg — returns EPG data for CCTV1",
    async () => {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const cntvName = "cctv1";
      const url = `https://api.cntv.cn/epg/epginfo3?serviceId=shiyi&d=${today}&c=${cntvName}`;

      const raw = await fetchUrl(url);
      expect(raw).toBeDefined();

      const parsed = CntvEpgResponseSchema.safeParse(raw);
      if (!parsed.success) {
        console.error(
          "[SMOKE] CntvEpgResponseSchema validation failed:",
          JSON.stringify(parsed.error.issues, null, 2),
        );
        console.error(
          "[SMOKE] Raw response snippet:",
          JSON.stringify(raw, null, 2).substring(0, 500),
        );
      }
      expect(parsed.success).toBe(true);

      const epgData = parsed.data![cntvName];
      expect(epgData).toBeDefined();
      expect(epgData!.program).toBeDefined();
      expect(epgData!.program!.length).toBeGreaterThan(0);

      const firstItem = epgData!.program![0]!;
      expect(firstItem).toHaveProperty("t");
      expect(firstItem).toHaveProperty("st");
      expect(firstItem).toHaveProperty("et");
      expect(typeof firstItem.t).toBe("string");
      expect(typeof firstItem.st).toBe("number");
      expect(typeof firstItem.et).toBe("number");
    },
    SMOKE_TIMEOUT,
  );
});
