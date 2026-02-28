import { getStringMD5 } from "./EncryUtils.js";
import { getddCalcuURL, getddCalcuURL720p } from "./ddCalcuURL.js";
import { printDebug, printGreen, printRed, printYellow } from "./colorOut.js";
import { fetchUrl } from "./net.js";
import { enableH265, enableHDR } from "../config.js";
import { delay } from "./fetchList.js";
import type { AndroidURLResult, SaltSign } from "../types/index.js";

const client_id = getStringMD5(Date.now().toString());

function getSaltAndSign(md5: string): SaltSign {
  const salt = 1230024;
  const suffix = "3ce941cc3cbc40528bfd1c64f9fdf6c0migu0123";
  const sign = getStringMD5(md5 + suffix);
  return { salt, sign };
}

async function getAndroidURL(
  userId: string,
  token: string,
  pid: string,
  rateType: number,
): Promise<AndroidURLResult> {
  if (rateType <= 1) {
    return { url: "", rateType: 0, content: null };
  }

  const timestramp = Date.now();
  const appVersion = "26000370";
  const headers: Record<string, string | number> = {
    AppVersion: 2600037000,
    TerminalId: "android",
    "X-UP-CLIENT-CHANNEL-ID": "2600037000-99000-200300220100002",
  };

  if (pid !== "641886683" && pid !== "641886773") {
    headers["appCode"] = "miguvideo_default_android";
  }

  if (rateType !== 2 && userId !== "" && token !== "") {
    headers.UserId = userId;
    headers.UserToken = token;
  }

  const str = timestramp + pid + appVersion;
  const md5 = getStringMD5(str);
  const result = getSaltAndSign(md5);

  let enableHDRStr = "";
  if (enableHDR) {
    enableHDRStr = "&4kvivid=true&2Kvivid=true&vivid=2";
  }
  let enableH265Str = "";
  if (enableH265) {
    enableH265Str = "&h265N=true";
  }

  const baseURL = "https://play.miguvideo.com/playurl/v1/play/playurl";
  let params =
    "?sign=" +
    result.sign +
    "&rateType=" +
    rateType +
    "&contId=" +
    pid +
    "&timestamp=" +
    timestramp +
    "&salt=" +
    result.salt +
    "&flvEnable=true&super4k=true" +
    (rateType === 9 ? "&ott=true" : "") +
    enableH265Str +
    enableHDRStr;

  printDebug(`Request URL: ${baseURL + params}`);
  let respData = (await fetchUrl(baseURL + params, {
    headers: headers as Record<string, string>,
  })) as Record<string, unknown>;
  printDebug(respData);

  if (respData.rid === "TIPS_NEED_MEMBER") {
    printYellow("Account has no membership, reducing quality");
    const body = respData.body as Record<string, unknown> | undefined;
    const urlInfo = body?.urlInfo as Record<string, unknown> | undefined;
    const respRateType = parseInt(String(urlInfo?.rateType)) > 4 ? 4 : 3;
    params =
      "?sign=" +
      result.sign +
      "&rateType=" +
      respRateType +
      "&contId=" +
      pid +
      "&timestamp=" +
      timestramp +
      "&salt=" +
      result.salt +
      "&flvEnable=true&super4k=true" +
      enableH265Str +
      enableHDRStr;
    printDebug(`Request URL: ${baseURL + params}`);
    respData = (await fetchUrl(baseURL + params, {
      headers: headers as Record<string, string>,
    })) as Record<string, unknown>;

    if (respData.rid === "TIPS_NEED_MEMBER") {
      printYellow("Account is not diamond member, reducing quality");
      params =
        "?sign=" +
        result.sign +
        "&rateType=3" +
        "&contId=" +
        pid +
        "&timestamp=" +
        timestramp +
        "&salt=" +
        result.salt +
        "&flvEnable=true&super4k=true" +
        enableH265Str +
        enableHDRStr;
      printDebug(`Request URL: ${baseURL + params}`);
      respData = (await fetchUrl(baseURL + params, {
        headers: headers as Record<string, string>,
      })) as Record<string, unknown>;
    }
  }

  printDebug(respData);
  const body = respData.body as Record<string, unknown> | undefined;
  const urlInfo = body?.urlInfo as Record<string, unknown> | undefined;
  const url = urlInfo?.url as string | undefined;

  if (!url) {
    return { url: "", rateType: 0, content: respData };
  }

  const content = body?.content as Record<string, unknown> | undefined;
  pid = (content?.contId as string) ?? pid;

  const resURL = getddCalcuURL(url, pid, "android", rateType, userId);
  const finalRateType = urlInfo?.rateType as string | undefined;

  return {
    url: resURL,
    rateType: parseInt(finalRateType ?? "0"),
    content: respData,
  };
}

async function getAndroidURL720p(pid: string): Promise<AndroidURLResult> {
  const timestramp = Math.round(Date.now()).toString();
  const appVersion = "2600034600";
  const appVersionID = appVersion + "-99000-201600010010028";
  const headers: Record<string, string> = {
    AppVersion: appVersion,
    TerminalId: "android",
    "X-UP-CLIENT-CHANNEL-ID": appVersionID,
    ClientId: client_id,
  };

  printDebug("client_id: " + client_id);
  if (pid !== "641886683" && pid !== "641886773") {
    headers["appCode"] = "miguvideo_default_android";
  }

  const str = timestramp + pid + appVersion.substring(0, 8);
  const md5 = getStringMD5(str);

  const salt = String(Math.floor(Math.random() * 1000000)).padStart(6, "0") + "25";
  const suffix = "2cac4f2c6c3346a5b34e085725ef7e33migu" + salt.substring(0, 4);
  const sign = getStringMD5(md5 + suffix);

  let enableHDRStr = "";
  if (enableHDR) {
    enableHDRStr = "&4kvivid=true&2Kvivid=true&vivid=2";
  }
  let enableH265Str = "";
  if (enableH265) {
    enableH265Str = "&h265N=true";
  }

  const baseURL = "https://play.miguvideo.com/playurl/v1/play/playurl";
  const params =
    "?sign=" +
    sign +
    "&rateType=3" +
    "&contId=" +
    pid +
    "&timestamp=" +
    timestramp +
    "&salt=" +
    salt +
    "&flvEnable=true&super4k=true" +
    enableH265Str +
    enableHDRStr;

  printDebug(`Request URL: ${baseURL + params}`);
  printDebug(headers);
  const respData = (await fetchUrl(baseURL + params, { headers })) as Record<string, unknown>;
  printDebug(respData);

  const body = respData.body as Record<string, unknown> | undefined;
  const urlInfo = body?.urlInfo as Record<string, unknown> | undefined;
  const url = urlInfo?.url as string | undefined;

  if (!url) {
    return { url: "", rateType: 0, content: respData };
  }

  const finalRateType = urlInfo?.rateType as string | undefined;
  const content = body?.content as Record<string, unknown> | undefined;
  pid = (content?.contId as string) ?? pid;

  const resURL = getddCalcuURL720p(url, pid);

  return {
    url: resURL,
    rateType: parseInt(finalRateType ?? "0"),
    content: respData,
  };
}

async function get302URL(resObj: AndroidURLResult): Promise<string> {
  try {
    let z = 1;
    while (z <= 6) {
      if (z >= 2) {
        printYellow(`Fetch failed, retry #${z - 1}`);
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        printRed("Request timed out");
      }, 6000);
      const obj = await fetch(resObj.url, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
      }).catch((err: unknown) => {
        clearTimeout(timeoutId);
        console.log(err);
        return undefined;
      });
      clearTimeout(timeoutId);

      if (obj) {
        const location = obj.headers.get("Location");
        if (location && location !== "") {
          if (!location.startsWith("http://bofang")) {
            return location;
          }
        }
      }
      if (z !== 6) {
        await delay(150);
      }
      z++;
    }
  } catch (error) {
    console.log(error);
  }
  printRed("Fetch failed, returning original URL");
  return "";
}

function printLoginInfo(resObj: AndroidURLResult | Record<string, unknown>): void {
  const content = (resObj as Record<string, unknown>).content as Record<string, unknown> | null;
  const body = content?.body as Record<string, unknown> | undefined;
  const auth = body?.auth as Record<string, unknown> | undefined;

  if (auth?.logined) {
    printGreen("Login authentication successful");
    if (auth.authResult === "FAIL") {
      printRed(`Auth failed, incomplete video content, may require VIP: ${auth.resultDesc}`);
    }
  } else {
    printYellow("Not logged in");
  }
}

export { getAndroidURL, getAndroidURL720p, get302URL, printLoginInfo };
