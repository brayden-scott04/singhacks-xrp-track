import { Wallet } from "xrpl";
import { requireEnv } from "../shared/env";
import type { ProviderId } from "../shared/types";

export interface AgentWallets {
  agent: Wallet;
  providers: Record<ProviderId, Wallet>;
}

let cached: AgentWallets | null = null;

function loadWallet(
  envKey:
    | "XRPL_SEED_AGENT"
    | "XRPL_SEED_PROVIDER_OPENAI"
    | "XRPL_SEED_PROVIDER_ANTHROPIC"
    | "XRPL_SEED_PROVIDER_GEMINI"
    | "XRPL_SEED_PROVIDER_DEEPSEEK"
    | "XRPL_SEED_PROVIDER_META",
): Wallet {
  let seed: string;
  try {
    seed = requireEnv(envKey);
  } catch {
    throw new Error(`${envKey} is not set. Run \`npm run setup:wallets\` to generate and fund testnet wallets first.`);
  }
  return Wallet.fromSeed(seed);
}

/** Loads all six wallets from seeds in .env. Never logs a seed — only classicAddress is safe to print. */
export function loadAgentWallets(): AgentWallets {
  if (cached) return cached;
  cached = {
    agent: loadWallet("XRPL_SEED_AGENT"),
    providers: {
      openai: loadWallet("XRPL_SEED_PROVIDER_OPENAI"),
      anthropic: loadWallet("XRPL_SEED_PROVIDER_ANTHROPIC"),
      gemini: loadWallet("XRPL_SEED_PROVIDER_GEMINI"),
      deepseek: loadWallet("XRPL_SEED_PROVIDER_DEEPSEEK"),
      meta: loadWallet("XRPL_SEED_PROVIDER_META"),
    },
  };
  return cached;
}
