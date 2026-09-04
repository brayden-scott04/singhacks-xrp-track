import { env } from "../shared/env.js";
import { PROVIDER_IDS, type ProviderId } from "../shared/types.js";

const PORTS: Record<ProviderId, number> = {
  openai: env.PORT_OPENAI,
  anthropic: env.PORT_ANTHROPIC,
  gemini: env.PORT_GEMINI,
};

export function providerBaseUrl(providerId: ProviderId): string {
  return `http://localhost:${PORTS[providerId]}`;
}

export function allProviderIds(): readonly ProviderId[] {
  return PROVIDER_IDS;
}
