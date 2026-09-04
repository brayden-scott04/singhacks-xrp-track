import { env } from "../../shared/env.js";
import { MODEL_PRICING } from "../../shared/pricing.js";
import { createProviderServer } from "../common/createProviderServer.js";
import { callGemini } from "../common/llmClients.js";

const app = createProviderServer({ pricing: MODEL_PRICING.gemini, callFn: callGemini });

app.listen(env.PORT_GEMINI, () => {
  console.log(`[gemini] provider adapter listening on :${env.PORT_GEMINI} (${MODEL_PRICING.gemini.modelId})`);
});
