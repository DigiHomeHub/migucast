import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/config.js", () => ({
  debug: false,
}));

vi.mock("../../src/utils/time.js", () => ({
  getLogDateTime: vi.fn(() => "2026-01-01 00:00:00:000"),
}));

vi.mock("../../src/api/migu_client.js", () => ({
  refreshMiguToken: vi.fn(),
}));

import { refreshMiguToken } from "../../src/api/migu_client.js";
import refreshToken from "../../src/utils/refresh_token.js";

const mockRefreshMiguToken = vi.mocked(refreshMiguToken);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("refresh_token", () => {
  it("returns false when userId is empty", async () => {
    const result = await refreshToken("", "someToken");
    expect(result).toBe(false);
    expect(mockRefreshMiguToken).not.toHaveBeenCalled();
  });

  it("returns false when token is empty", async () => {
    const result = await refreshToken("user123", "");
    expect(result).toBe(false);
    expect(mockRefreshMiguToken).not.toHaveBeenCalled();
  });

  it("returns true on REFRESH_TOKEN_SUCCESS", async () => {
    mockRefreshMiguToken.mockResolvedValueOnce({
      resultCode: "REFRESH_TOKEN_SUCCESS",
    });

    const result = await refreshToken("user123", "token456");

    expect(result).toBe(true);
    expect(mockRefreshMiguToken).toHaveBeenCalledWith("user123", "token456");
  });

  it("returns false on non-success response", async () => {
    vi.spyOn(console, "dir").mockImplementation(() => {});
    mockRefreshMiguToken.mockResolvedValueOnce({
      resultCode: "FAIL",
    });

    const result = await refreshToken("user123", "token456");
    expect(result).toBe(false);
  });

  it("returns false when API returns undefined", async () => {
    mockRefreshMiguToken.mockResolvedValueOnce(undefined);

    const result = await refreshToken("user123", "token456");
    expect(result).toBe(false);
  });

  it("returns false on network error", async () => {
    mockRefreshMiguToken.mockRejectedValueOnce(new Error("network error"));

    const result = await refreshToken("user123", "token456");
    expect(result).toBe(false);
  });
});
