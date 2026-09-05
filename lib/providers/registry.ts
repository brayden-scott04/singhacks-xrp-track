import { MODEL_PRICING } from "../shared/pricing";
import { createProviderHandlers } from "./createProviderHandlers";
import { callAnthropic, callGemini, callOpenAI } from "./llmClients";

export const openaiHandlers = createProviderHandlers({ pricing: MODEL_PRICING.openai, callFn: callOpenAI });
export const anthropicHandlers = createProviderHandlers({ pricing: MODEL_PRICING.anthropic, callFn: callAnthropic });
export const geminiHandlers = createProviderHandlers({ pricing: MODEL_PRICING.gemini, callFn: callGemini });
