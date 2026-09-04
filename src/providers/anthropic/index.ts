import { env } from "../../shared/env.js";
import { MODEL_PRICING } from "../../shared/pricing.js";
import { createProviderServer } from "../common/createProviderServer.js";
import { callAnthropic } from "../common/llmClients.js";

const app = createProviderServer({ pricing: MODEL_PRICING.anthropic, callFn: callAnthropic });

app.listen(env.PORT_ANTHROPIC, () => {
  console.log(`[anthropic] provider adapter listening on :${env.PORT_ANTHROPIC} (${MODEL_PRICING.anthropic.modelId})`);
});
