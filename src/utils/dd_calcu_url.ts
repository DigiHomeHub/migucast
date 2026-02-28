/**
 * URL anti-tamper signing for Migu video playback.
 * Generates the `ddCalcu` query parameter by interleaving and scrambling
 * characters from `puData`, the program ID, date, and platform-specific keys.
 * Also provides a WebAssembly-based encryption path for alternative signing.
 */
import { userId } from "../config.js";
import { fetchUrl } from "./net.js";
import { getDateString } from "./time.js";
import type { ClientType } from "../types/index.js";

interface PlatformConfig {
  keys: string;
  words: string[];
  thirdReplaceIndex: number;
  suffix: string;
}

const list: Record<ClientType, PlatformConfig> = {
  h5: {
    keys: "yzwxcdabgh",
    words: ["", "y", "0", "w"],
    thirdReplaceIndex: 1,
    suffix: "&sv=10000&ct=www",
  },
  android: {
    keys: "cdabyzwxkl",
    words: ["v", "a", "0", "a"],
    thirdReplaceIndex: 6,
    suffix: "&sv=10004&ct=android",
  },
};

const importObj: WebAssembly.Imports = {
  a: {
    a: () => {},
    b: () => 0,
    c: () => {},
    d: () => 0,
    e: () => 0,
    f: () => 0,
    g: () => 0,
    h: () => 0,
    i: () => 0,
    j: () => 0,
  },
};

/** Writes a video URL into WASM linear memory, invokes the encrypt export, and reads the result. */
function encrypt(
  videoURL: string,
  memoryView: Uint8Array,
  getEncrypt: (n: number) => number,
): string {
  let i: number;
  for (i = 0; i < videoURL.length; ++i) {
    memoryView[i] = videoURL.charCodeAt(i);
  }
  memoryView[i] = 0;

  const start = getEncrypt(0);

  let encryptedURL = "";
  for (let j = start; memoryView[j] !== 0; ++j) {
    encryptedURL += String.fromCharCode(memoryView[j]!);
  }
  return encryptedURL;
}

interface WasmExports {
  k: WebAssembly.Memory;
  m: (n: number) => number;
}

async function initWasm(wasmURL: string): Promise<WasmExports> {
  const resp = (await fetchUrl(wasmURL)) as Response;
  const { instance } = await WebAssembly.instantiateStreaming(resp, importObj);
  return instance.exports as unknown as WasmExports;
}

function getEncryptUrl(exports: WasmExports, videoURL: string): string {
  const memory = exports.k;
  const memoryView = new Uint8Array(memory.buffer);
  const getEncrypt = exports.m;
  return encrypt(videoURL, memoryView, getEncrypt);
}

/**
 * Core signing algorithm: interleaves `puData` characters with platform-specific
 * key lookups derived from date, program ID, and user ID to produce a tamper-proof token.
 */
function getDdCalcu(
  puData: string,
  programId: string,
  clientType: ClientType,
  rateType: string,
  urlUserId: string,
): string {
  if (!puData || !programId) {
    return "";
  }

  const id = urlUserId || userId || process.env.USERID || "";
  if (id) {
    const charIndex = id[7];
    if (charIndex !== undefined) {
      const words1 = list.android.keys[Number(charIndex)];
      if (words1 !== undefined) {
        list.android.words[0] = words1;
        list.h5.words[0] = words1;
      }
    }
  }

  const keys = list[clientType].keys;
  const words = [...list[clientType].words];
  const thirdReplaceIndex = list[clientType].thirdReplaceIndex;

  if (clientType === "android" && rateType === "2") {
    words[0] = "v";
  }
  if (id.length > 3 && id.length <= 8) {
    words[0] = "e";
  }

  const puDataLength = puData.length;
  const ddCalcu: string[] = [];
  for (let i = 0; i < puDataLength / 2; i++) {
    ddCalcu.push(puData[puDataLength - i - 1]!);
    ddCalcu.push(puData[i]!);
    switch (i) {
      case 1:
        ddCalcu.push(words[i - 1]!);
        break;
      case 2:
        ddCalcu.push(keys[parseInt(getDateString(new Date())[0]!)]!);
        break;
      case 3:
        ddCalcu.push(keys[Number(programId[thirdReplaceIndex])]!);
        break;
      case 4:
        ddCalcu.push(words[i - 1]!);
        break;
    }
  }
  return ddCalcu.join("");
}

/** Appends the `ddCalcu` anti-tamper token and platform suffix to a playback URL. */
function getDdCalcuUrl(
  puDataUrl: string,
  programId: string,
  clientType: ClientType,
  rateType: string | number,
  urlUserId: string,
): string {
  if (!puDataUrl || !programId) {
    return "";
  }

  if (clientType !== "android" && clientType !== "h5") {
    return "";
  }

  const puData = puDataUrl.split("&puData=")[1];
  if (!puData) return "";

  const ddCalcu = getDdCalcu(
    puData,
    programId,
    clientType,
    String(rateType),
    urlUserId,
  );
  const suffix = list[clientType].suffix;

  return `${puDataUrl}&ddCalcu=${ddCalcu}${suffix}`;
}

/** Simplified 720p signing variant with fixed Android keys (no user credentials required). */
function getDdCalcu720p(puData: string, programId: string): string {
  if (!puData || !programId) {
    return "";
  }

  const keys = "cdabyzwxkl";
  const ddCalcu: string[] = [];
  for (let i = 0; i < puData.length / 2; i++) {
    ddCalcu.push(puData[puData.length - i - 1]!);
    ddCalcu.push(puData[i]!);
    switch (i) {
      case 1:
        ddCalcu.push("v");
        break;
      case 2:
        ddCalcu.push(keys[parseInt(getDateString(new Date())[2]!)]!);
        break;
      case 3:
        ddCalcu.push(keys[Number(programId[6])]!);
        break;
      case 4:
        ddCalcu.push("a");
        break;
    }
  }
  return ddCalcu.join("");
}

/** Appends the 720p `ddCalcu` token to a playback URL (always uses Android suffix). */
function getDdCalcuUrl720p(puDataUrl: string, programId: string): string {
  if (!puDataUrl || !programId) {
    return "";
  }

  const puData = puDataUrl.split("&puData=")[1];
  if (!puData) return "";

  const ddCalcu = getDdCalcu720p(puData, programId);
  return `${puDataUrl}&ddCalcu=${ddCalcu}&sv=10004&ct=android`;
}

export { initWasm, getEncryptUrl, getDdCalcuUrl, getDdCalcuUrl720p };
