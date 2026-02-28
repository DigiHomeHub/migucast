/**
 * Migu user token refresh flow.
 * Delegates the actual API call to the centralized API layer.
 */
import { refreshMiguToken } from "../api/migu_client.js";
import { logger } from "../logger.js";

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
      logger.warn("Token refresh returned non-success", respResult);
    }
  } catch (error) {
    logger.error("Token refresh request failed", error);
  }

  return false;
}

export default refreshToken;
