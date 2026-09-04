import "dotenv/config";
import { z } from "zod";

// .env leaves unset keys as "" (e.g. `OPENAI_API_KEY=`), not absent — treat
// blank strings as undefined so `.optional()` behaves as intended.
const optionalString = () => z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).optional());

const envSchema = z.object({
  OPENAI_API_KEY: optionalString(),
  ANTHROPIC_API_KEY: optionalString(),
  GOOGLE_API_KEY: optionalString(),
  GEMINI_API_KEY: optionalString(),

  XRPL_SEED_AGENT: optionalString(),
  XRPL_SEED_PROVIDER_OPENAI: optionalString(),
  XRPL_SEED_PROVIDER_ANTHROPIC: optionalString(),
  XRPL_SEED_PROVIDER_GEMINI: optionalString(),

  XRPL_NETWORK: z.string().default("wss://s.altnet.rippletest.net:51233"),
  SETTLEMENT_MODE: z.enum(["channel", "payment"]).default("channel"),
  XRP_USD_RATE: z.coerce.number().positive().default(0.5),

  SESSION_SPEND_CAP_USD: z.coerce.number().positive().default(2.0),
  PROVIDER_QUOTE_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),

  PORT_AGENT: z.coerce.number().int().positive().default(4000),
  PORT_OPENAI: z.coerce.number().int().positive().default(4001),
  PORT_ANTHROPIC: z.coerce.number().int().positive().default(4002),
  PORT_GEMINI: z.coerce.number().int().positive().default(4003),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Environment validation failed — check .env against .env.example");
}

export const env = parsed.data;

export function requireGoogleApiKey(): string {
  const key = env.GOOGLE_API_KEY ?? env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GOOGLE_API_KEY (or GEMINI_API_KEY) is not set");
  }
  return key;
}

export function requireEnv<K extends keyof typeof env>(key: K): NonNullable<(typeof env)[K]> {
  const value = env[key];
  if (value === undefined || value === "") {
    throw new Error(`${String(key)} is not set — see .env.example`);
  }
  return value as NonNullable<(typeof env)[K]>;
}
