import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../src/config/env";
import { ResilientLlm } from "../src/llm";
import { defaultPersonality } from "../src/personality/profile";

const original = { ...config.llm };

test("resilient llm falls back to mock when ollama is unavailable", async () => {
  config.llm.mode = "auto";
  config.llm.ollamaBaseUrl = "http://127.0.0.1:1";
  config.llm.ollamaModel = "fake-model";

  const llm = new ResilientLlm();
  const response = await llm.generate({
    personality: defaultPersonality,
    state: { status: "test" },
    memories: [],
    goals: [],
    tools: [],
    task: "responder"
  });

  assert.equal(response.provider, "mock");
  assert.equal(response.usedFallback, true);

  config.llm.mode = original.mode;
  config.llm.ollamaBaseUrl = original.ollamaBaseUrl;
  config.llm.ollamaModel = original.ollamaModel;
});
