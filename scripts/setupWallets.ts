import * as fs from "node:fs";
import { Client } from "xrpl";
import { env } from "../lib/shared/env";

const ENV_PATH = ".env";

const WALLETS: Array<{ envKey: string; label: string }> = [
  { envKey: "XRPL_SEED_AGENT", label: "agent (payer)" },
  { envKey: "XRPL_SEED_PROVIDER_OPENAI", label: "openai provider (receiver)" },
  { envKey: "XRPL_SEED_PROVIDER_ANTHROPIC", label: "anthropic provider (receiver)" },
  { envKey: "XRPL_SEED_PROVIDER_GEMINI", label: "gemini provider (receiver)" },
  { envKey: "XRPL_SEED_PROVIDER_DEEPSEEK", label: "deepseek provider (receiver)" },
];

function appendSeedToEnv(envKey: string, seed: string): void {
  const existing = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
  const prefix = existing.length && !existing.endsWith("\n") ? "\n" : "";
  fs.appendFileSync(ENV_PATH, `${prefix}${envKey}="${seed}"\n`, { encoding: "utf8" });
}

async function main() {
  if (!fs.existsSync(ENV_PATH)) {
    fs.writeFileSync(ENV_PATH, "", { encoding: "utf8" });
  }

  const client = new Client(env.XRPL_NETWORK);
  await client.connect();
  console.log(`Connected to ${env.XRPL_NETWORK}\n`);

  for (const { envKey, label } of WALLETS) {
    const already = (env as Record<string, unknown>)[envKey];
    if (already) {
      console.log(`- ${label}: ${envKey} already set in .env, skipping (delete the line to regenerate)`);
      continue;
    }

    const { wallet, balance } = await client.fundWallet();
    // Never print wallet.seed. Only the address is safe to show.
    appendSeedToEnv(envKey, wallet.seed!);
    console.log(`+ ${label}: ${wallet.classicAddress} funded with ${balance} XRP (seed saved to .env as ${envKey})`);
  }

  await client.disconnect();
  console.log("\nDone. Re-run `npm run dev` after this — wallets load lazily from .env at first use.");
}

main().catch((err) => {
  console.error("setup:wallets failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
