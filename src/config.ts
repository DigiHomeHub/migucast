/**
 * Application configuration module.
 * Defines and validates all runtime settings using Zod schemas.
 * Supports both Node.js (process.env) and Workers (env bindings) via parseConfig().
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
  dataDir: z.string().optional(),
});

export type FullAppConfig = z.infer<typeof AppConfigSchema> & {
  dataDir: string;
  logFile: string | undefined;
};

/** Maps the `m`-prefixed env variable names to config field names. */
export function mapEnvToConfigInput(
  env: Record<string, string | undefined>,
): Record<string, unknown> {
  return {
    userId: env.muserId,
    token: env.mtoken,
    port: env.mport,
    host: env.mhost,
    rateType: env.mrateType,
    debug: env.mdebug,
    pass: env.mpass,
    enableHdr: env.menableHDR,
    enableH265: env.menableH265,
    programInfoUpdateInterval: env.mupdateInterval,
    logLevel: env.mlogLevel,
    logFile: env.mlogFile,
    dataDir: env.mdataDir,
  };
}

/** Parses and validates config from a generic env record. Usable by both Node.js and Workers. */
export function parseConfig(
  env: Record<string, string | undefined>,
  fallbackDataDir: string = ".",
): FullAppConfig {
  const input = mapEnvToConfigInput(env);
  const parsed = AppConfigSchema.parse(input);
  const dataDir = parsed.dataDir ?? fallbackDataDir;
  return {
    ...parsed,
    dataDir,
    logFile:
      parsed.logFile ??
      (parsed.dataDir ? `${dataDir}/migucast.log` : undefined),
  };
}

// --- Node.js default initialization (reads process.env at module load) ---

const nodeConfig = parseConfig(
  process.env as Record<string, string | undefined>,
  process.cwd(),
);

export const config = nodeConfig;

export const dataDir: string = nodeConfig.dataDir;

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
} = nodeConfig;
