import { z } from "zod";

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
  enableHDR: envBoolean(true),
  enableH265: envBoolean(true),
  programInfoUpdateInterval: z.coerce.number().int().positive().default(6),
});

export const config = AppConfigSchema.parse({
  userId: process.env.muserId,
  token: process.env.mtoken,
  port: process.env.mport,
  host: process.env.mhost,
  rateType: process.env.mrateType,
  debug: process.env.mdebug,
  pass: process.env.mpass,
  enableHDR: process.env.menableHDR,
  enableH265: process.env.menableH265,
  programInfoUpdateInterval: process.env.mupdateInterval,
});

export const {
  userId,
  token,
  port,
  host,
  rateType,
  debug,
  pass,
  enableHDR,
  enableH265,
  programInfoUpdateInterval,
} = config;
