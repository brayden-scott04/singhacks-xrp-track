import { env } from "../shared/env";
import { PROVIDER_IDS, type ProviderId } from "../shared/types";

const PROVIDER_ROUTES: Record<ProviderId, { quote: string; execute: string }> = {
  openai: { quote: "/api/providers/openai/quote", execute: "/api/providers/openai/execute" },
  anthropic: { quote: "/api/providers/anthropic/quote", execute: "/api/providers/anthropic/execute" },
  gemini: { quote: "/api/providers/gemini/quote", execute: "/api/providers/gemini/execute" },
  deepseek: { quote: "/api/providers/deepseek/quote", execute: "/api/providers/deepseek/execute" },
};

/**
 * Resolves this app's own base URL so the orchestrator can call provider
 * routes over real HTTP (preserving genuine 402 round-trips) instead of the
 * old per-provider `localhost:<port>` scheme, which no longer applies once
 * everything is one Next.js app/origin.
 */
export function getAppBaseUrl(): string {
  return env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export function providerUrl(providerId: ProviderId, kind: "quote" | "execute"): string {
  return new URL(PROVIDER_ROUTES[providerId][kind], getAppBaseUrl()).toString();
}

export function allProviderIds(): readonly ProviderId[] {
  return PROVIDER_IDS;
}
