import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/utils/net.js", () => ({
  fetchUrl: vi.fn(),
}));

vi.mock("../../src/utils/crypto_utils.js", () => ({
  aesEncrypt: vi.fn(() => "mockEncrypted"),
  getStringMd5: vi.fn(() => "mockMD5"),
  rsaSign: vi.fn(() => "mockRSASign"),
}));

import { fetchUrl } from "../../src/utils/net.js";
import refreshToken from "../../src/utils/refresh_token.js";

const mockFetchUrl = vi.mocked(fetchUrl);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("refresh_token", () => {
  it("returns false when userId is empty", async () => {
    const result = await refreshToken("", "someToken");
    expect(result).toBe(false);
    expect(mockFetchUrl).not.toHaveBeenCalled();
  });

  it("returns false when token is empty", async () => {
    const result = await refreshToken("user123", "");
    expect(result).toBe(false);
    expect(mockFetchUrl).not.toHaveBeenCalled();
  });

  it("returns true on REFRESH_TOKEN_SUCCESS", async () => {
    mockFetchUrl.mockResolvedValueOnce({
      resultCode: "REFRESH_TOKEN_SUCCESS",
    });

    const result = await refreshToken("user123", "token456");

    expect(result).toBe(true);
    expect(mockFetchUrl).toHaveBeenCalledWith(
      expect.stringContaining("token_refresh_migu_plus"),
      expect.objectContaining({
        method: "post",
        headers: expect.objectContaining({
          userId: "user123",
          userToken: "token456",
        }),
      }),
    );
  });

  it("returns false on non-success response", async () => {
    vi.spyOn(console, "dir").mockImplementation(() => {});
    mockFetchUrl.mockResolvedValueOnce({
      resultCode: "FAIL",
    });

    const result = await refreshToken("user123", "token456");
    expect(result).toBe(false);
  });

  it("returns false when fetchUrl returns undefined", async () => {
    mockFetchUrl.mockResolvedValueOnce(undefined);

    const result = await refreshToken("user123", "token456");
    expect(result).toBe(false);
  });

  it("returns false on network error", async () => {
    mockFetchUrl.mockRejectedValueOnce(new Error("network error"));

    const result = await refreshToken("user123", "token456");
    expect(result).toBe(false);
  });
});
