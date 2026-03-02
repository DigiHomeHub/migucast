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
  enableHdr: boolean;
  enableH265: boolean;
  programInfoUpdateInterval: number;
}

export interface ChannelPics {
  highResolutionH: string;
  [key: string]: string;
}

export interface ChannelInfo {
  pid: string;
  name: string;
  pics: ChannelPics;
  [key: string]: unknown;
}

export interface CategoryData {
  name: string;
  vomsId: string;
  dataList: ChannelInfo[];
  [key: string]: unknown;
}

export interface PlaylistResult {
  content: string | null;
  contentType: string;
}

export interface ChannelResult {
  code: number;
  pid: string;
  desc: string;
  playUrl: string;
}

export interface AndroidUrlResult {
  url: string;
  rateType: number;
  content: ApiResponse | null;
}

export interface CacheEntry {
  expiresAt: number;
  url: string;
  content: ApiResponse | null;
}

export interface CacheLookupResult {
  haveCache: boolean;
  code: number;
  pid: string;
  playUrl: string;
  cacheDesc: string;
}

export interface SaltAndSign {
  salt: number;
  sign: string;
}

export interface ApiResponse {
  rid?: string | null;
  resultCode?: string | null;
  message?: string | null;
  body?: Record<string, unknown> | null;
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

export interface ZbproUrlResult {
  m3u: string;
  txt: string;
}

export type ClientType = "android" | "h5";
