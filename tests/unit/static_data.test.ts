import { describe, it, expect } from "vitest";
import {
  cntvNames,
  domainWhiteList,
  repoLinkUpdateTimestamp,
} from "../../src/utils/static_data.js";

describe("static_data", () => {
  describe("cntvNames", () => {
    it("maps CCTV channel display names to identifiers", () => {
      expect(cntvNames["CCTV1综合"]).toBe("cctv1");
      expect(cntvNames["CCTV5体育"]).toBe("cctv5");
      expect(cntvNames["CCTV5+体育赛事"]).toBe("cctv5plus");
      expect(cntvNames["CCTV13新闻"]).toBe("cctv13");
    });

    it("contains all 19 CCTV channels", () => {
      expect(Object.keys(cntvNames)).toHaveLength(19);
    });

    it("has unique identifier values", () => {
      const values = Object.values(cntvNames);
      expect(new Set(values).size).toBe(values.length);
    });
  });

  describe("domainWhiteList", () => {
    it("is a non-empty array of domain strings", () => {
      expect(domainWhiteList.length).toBeGreaterThan(0);
      domainWhiteList.forEach((domain) => {
        expect(typeof domain).toBe("string");
        expect(domain.length).toBeGreaterThan(0);
      });
    });

    it("contains known domains", () => {
      expect(domainWhiteList).toContain("play.kankanlive.com");
      expect(domainWhiteList).toContain("hlsbkmgsplive.miguvideo.com");
    });
  });

  describe("repoLinkUpdateTimestamp", () => {
    it("is a positive number representing a timestamp", () => {
      expect(typeof repoLinkUpdateTimestamp).toBe("number");
      expect(repoLinkUpdateTimestamp).toBeGreaterThan(0);
    });
  });
});
