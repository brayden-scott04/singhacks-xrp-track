import { INDUSTRY_AGENT_IDS, type IndustryAgentId, type ProviderId } from "../shared/types";

export interface IndustryProfile {
  industryId: IndustryAgentId;
  providerId: ProviderId;
  name: string;
  description: string;
}

/**
 * Static mapping from business vertical to the LLM provider that backs it.
 * The provider itself never sees the industry framing — this mapping is
 * purely how the decision agent labels/organizes its bidding pool.
 */
const INDUSTRY_PROFILES: Record<IndustryAgentId, IndustryProfile> = {
  legal: {
    industryId: "legal",
    providerId: "anthropic",
    name: "Legal",
    description: "Contract review, compliance, and legal drafting specialist",
  },
  healthcare: {
    industryId: "healthcare",
    providerId: "openai",
    name: "Healthcare",
    description: "Clinical documentation and healthcare operations specialist",
  },
  finance: {
    industryId: "finance",
    providerId: "gemini",
    name: "Finance",
    description: "Financial analysis and reporting specialist",
  },
};

export function allIndustryIds(): readonly IndustryAgentId[] {
  return INDUSTRY_AGENT_IDS;
}

export function industryProfile(industryId: IndustryAgentId): IndustryProfile {
  return INDUSTRY_PROFILES[industryId];
}
