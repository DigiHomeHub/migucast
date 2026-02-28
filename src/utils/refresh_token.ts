/**
 * Migu user token refresh flow.
 * Constructs an AES-encrypted + RSA-signed POST request to the Migu Plus
 * token refresh endpoint to extend session validity.
 */
import { aesEncrypt, getStringMd5, rsaSign } from "./crypto_utils.js";
import { fetchUrl } from "./net.js";

/** Percent-encodes a string following RFC 3986 (also encodes `!'()*` and replaces `%20` with `+`). */
function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(
      /[!'()*]/g,
      (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
    )
    .replace(/%20/g, "+");
}

/** Refreshes the Migu user token; returns `true` on success, `false` on any failure. */
async function refreshToken(userId: string, token: string): Promise<boolean> {
  if (!userId || !token) {
    return false;
  }

  const time = Math.floor(Date.now() / 1000);
  const baseData = `{"userToken":"${token}","autoDelay":true,"deviceId":"","userId":"${userId}","timestamp":"${time}"}`;

  const encryptedData = aesEncrypt(baseData);
  const data = '{"data":"' + encryptedData + '"}';

  const str = getStringMd5(data);
  const sign = percentEncode(rsaSign(str));

  const headers: Record<string, string> = {
    userId: userId,
    userToken: token,
    "Content-Type": "application/json; charset=utf-8",
  };

  const baseUrl =
    "https://migu-app-umnb.miguvideo.com/login/token_refresh_migu_plus";
  const params = `?clientId=27fb3129-5a54-45bc-8af1-7dc8f1155501&sign=${sign}&signType=RSA`;

  try {
    const respResult = (await fetchUrl(baseUrl + params, {
      headers: headers,
      method: "post",
      body: data,
    })) as { resultCode?: string } | undefined;

    if (respResult?.resultCode === "REFRESH_TOKEN_SUCCESS") {
      return true;
    }
    console.dir(respResult, { depth: null });
  } catch {
    // request failed
  }

  return false;
}

export default refreshToken;
