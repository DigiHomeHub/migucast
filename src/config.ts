/**
 * Application configuration module.
 * Defines and validates all runtime settings from environment variables using Zod schemas.
 * Environment variable prefix: `m` (e.g. `muserId`, `mtoken`, `mport`).
 */
import { z } from "zod";

/** Preprocessor that coerces env-style string booleans ("true"/"false") into native booleans. */
const envBoolean = (defaultValue: boolean) =>
  z.preprocess((val: unknown) => {
    if (val === undefined || val === null || val === "") return defaultValue;
    if (typeof val === "boolean") return val;
    if (typeof val === "string") return val.toLowerCase() !== "false";
    return defaultValue;
  }, z.boolean());

export const AppConfigSchema = z.object({
  userId: z.string().default(""),
  token: z.string().default(""),
  port: z.coerce.number().int().positive().default(1234),
  host: z.string().default(""),
  rateType: z.coerce.number().int().min(1).max(9).default(3),
  debug: envBoolean(false),
  pass: z
    .string()
    .regex(/^[a-zA-Z0-9]*$/)
    .default(""),
  enableHdr: envBoolean(true),
  enableH265: envBoolean(true),
  programInfoUpdateInterval: z.coerce.number().int().positive().default(6),
  logLevel: z
    .enum(["silly", "trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
  logFile: z.string().optional(),
});

export const config = AppConfigSchema.parse({
  userId: process.env.muserId,
  token: process.env.mtoken,
  port: process.env.mport,
  host: process.env.mhost,
  rateType: process.env.mrateType,
  debug: process.env.mdebug,
  pass: process.env.mpass,
  enableHdr: process.env.menableHDR,
  enableH265: process.env.menableH265,
  programInfoUpdateInterval: process.env.mupdateInterval,
  logLevel: process.env.mlogLevel,
  logFile: process.env.mlogFile,
});

export const {
  userId,
  token,
  port,
  host,
  rateType,
  debug,
  pass,
  enableHdr,
  enableH265,
  programInfoUpdateInterval,
  logLevel,
  logFile,
} = config;
