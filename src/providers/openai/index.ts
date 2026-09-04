import { env } from "../../shared/env.js";
import { MODEL_PRICING } from "../../shared/pricing.js";
import { createProviderServer } from "../common/createProviderServer.js";
import { callOpenAI } from "../common/llmClients.js";

const app = createProviderServer({ pricing: MODEL_PRICING.openai, callFn: callOpenAI });

app.listen(env.PORT_OPENAI, () => {
  console.log(`[openai] provider adapter listening on :${env.PORT_OPENAI} (${MODEL_PRICING.openai.modelId})`);
});
