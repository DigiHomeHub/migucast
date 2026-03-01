/**
 * Pluggable logging facade.
 * All modules import `logger` from here. The actual implementation is set
 * at startup via `setLoggerImpl()` — tslog for Node.js, console for Workers.
 * Before initialization, logs are silently dropped.
 */
import type { LoggerPort } from "./platform/types.js";

let _impl: LoggerPort | null = null;

export function setLoggerImpl(impl: LoggerPort): void {
  _impl = impl;
}

export const logger: LoggerPort = {
  info(...args: unknown[]): void {
    _impl?.info(...args);
  },
  warn(...args: unknown[]): void {
    _impl?.warn(...args);
  },
  error(...args: unknown[]): void {
    _impl?.error(...args);
  },
  debug(...args: unknown[]): void {
    _impl?.debug(...args);
  },
  trace(...args: unknown[]): void {
    _impl?.trace(...args);
  },
};
