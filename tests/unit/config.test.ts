import { describe, it, expect } from "vitest";
import { AppConfigSchema } from "../../src/config.js";

describe("AppConfigSchema", () => {
  it("provides defaults when all env vars are undefined", () => {
    const result = AppConfigSchema.parse({});
    expect(result.userId).toBe("");
    expect(result.token).toBe("");
    expect(result.port).toBe(1234);
    expect(result.host).toBe("");
    expect(result.rateType).toBe(3);
    expect(result.debug).toBe(false);
    expect(result.pass).toBe("");
    expect(result.enableHdr).toBe(true);
    expect(result.enableH265).toBe(true);
    expect(result.programInfoUpdateInterval).toBe(6);
  });

  it("coerces string port to number", () => {
    const result = AppConfigSchema.parse({ port: "8080" });
    expect(result.port).toBe(8080);
  });

  it("coerces string boolean to boolean", () => {
    const result = AppConfigSchema.parse({ debug: "true", enableHdr: "false" });
    expect(result.debug).toBe(true);
    expect(result.enableHdr).toBe(false);
  });

  it("validates rateType range", () => {
    expect(() => AppConfigSchema.parse({ rateType: "0" })).toThrow();
    expect(() => AppConfigSchema.parse({ rateType: "10" })).toThrow();
    const valid = AppConfigSchema.parse({ rateType: "4" });
    expect(valid.rateType).toBe(4);
  });

  it("validates pass format (alphanumeric only)", () => {
    const valid = AppConfigSchema.parse({ pass: "myPass123" });
    expect(valid.pass).toBe("myPass123");

    expect(() => AppConfigSchema.parse({ pass: "my pass!" })).toThrow();
  });

  it("rejects negative port", () => {
    expect(() => AppConfigSchema.parse({ port: "-1" })).toThrow();
  });
});
