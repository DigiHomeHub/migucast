/**
 * Core type definitions for the migucast application.
 * Covers configuration, channel data, API responses, cache structures,
 * and third-party integration contracts.
 */

export interface AppConfig {
  userId: string;
  token: string;
  port: number;
  host: string;
  rateType: number;
  debug: boolean;
  pass: string;
  enableHDR: boolean;
  enableH265: boolean;
  programInfoUpdateInterval: number;
}

export interface ChannelPics {
  highResolutionH: string;
  [key: string]: string;
}

export interface ChannelInfo {
  pID: string;
  name: string;
  pics: ChannelPics;
  [key: string]: unknown;
}

export interface CategoryData {
  name: string;
  vomsID: string;
  dataList: ChannelInfo[];
  [key: string]: unknown;
}

export interface InterfaceResult {
  content: string | Buffer | null;
  contentType: string;
}

export interface ChannelResult {
  code: number;
  pID: string;
  desc: string;
  playURL: string;
}

export interface AndroidURLResult {
  url: string;
  rateType: number;
  content: ApiResponse | null;
}

export interface CacheEntry {
  valTime: number;
  url: string;
  content: ApiResponse | null;
}

export interface CacheResult {
  haveCache: boolean;
  code: number;
  pID: string;
  playURL: string;
  cacheDesc: string;
}

export interface SaltSign {
  salt: number;
  sign: string;
}

export interface ApiResponse {
  rid?: string;
  resultCode?: string;
  message?: string;
  body?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ZbproChannel {
  title: string;
  province?: string;
  ct?: unknown;
  urls?: string[];
  [key: string]: unknown;
}

export interface ZbproResult {
  timestamp: number;
  data: ZbproChannel[];
}

export interface ZbproURLResult {
  m3u: string;
  txt: string;
}

export type ClientType = "android" | "h5";
