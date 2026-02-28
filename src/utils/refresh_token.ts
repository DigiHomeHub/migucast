/**
 * Migu user token refresh flow.
 * Delegates the actual API call to the centralized API layer.
 */
import { refreshMiguToken } from "../api/migu_client.js";

/** Refreshes the Migu user token; returns `true` on success, `false` on any failure. */
async function refreshToken(userId: string, token: string): Promise<boolean> {
  if (!userId || !token) {
    return false;
  }

  try {
    const respResult = await refreshMiguToken(userId, token);
    if (respResult?.resultCode === "REFRESH_TOKEN_SUCCESS") {
      return true;
    }
    if (respResult) {
      console.dir(respResult, { depth: null });
    }
  } catch {
    // request failed
  }

  return false;
}

export default refreshToken;
