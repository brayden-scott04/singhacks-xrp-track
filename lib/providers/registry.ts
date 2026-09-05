import { MODEL_PRICING } from "../shared/pricing";
import { createProviderHandlers } from "./createProviderHandlers";
import { callAnthropic, callDeepSeek, callGemini, callOpenAI } from "./llmClients";

export const openaiHandlers = createProviderHandlers({ pricing: MODEL_PRICING.openai, callFn: callOpenAI });
export const anthropicHandlers = createProviderHandlers({ pricing: MODEL_PRICING.anthropic, callFn: callAnthropic });
export const geminiHandlers = createProviderHandlers({ pricing: MODEL_PRICING.gemini, callFn: callGemini });
export const deepseekHandlers = createProviderHandlers({ pricing: MODEL_PRICING.deepseek, callFn: callDeepSeek });
