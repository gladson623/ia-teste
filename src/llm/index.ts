import { config } from "../config/env";
import { MockLlmProvider } from "./mockProvider";
import { OllamaProvider } from "./ollamaProvider";
import { DecisionInput, ReflectionInput, RepairInput } from "./provider";
import { LlmContext, LlmProvider, LlmResponse } from "./types";

export class ResilientLlm implements LlmProvider {
  name = "resilient";

  private readonly mock = new MockLlmProvider();
  private readonly ollama = new OllamaProvider({
    baseUrl: config.llm.ollamaBaseUrl,
    model: config.llm.ollamaModel,
    timeoutMs: config.llm.ollamaTimeoutMs
  });

  async available(): Promise<boolean> {
    if (config.llm.mode === "mock") return true;
    if (config.llm.mode === "ollama") return this.ollama.available();
    return (await this.ollama.available()) || this.mock.available();
  }

  generate(context: LlmContext): Promise<LlmResponse> {
    return this.run((provider) => provider.generate(context));
  }

  decide(input: DecisionInput): Promise<LlmResponse> {
    return this.run((provider) => provider.decide(input));
  }

  repairDecision(input: RepairInput): Promise<LlmResponse> {
    return this.run((provider) => provider.repairDecision(input));
  }

  reflect(input: ReflectionInput): Promise<LlmResponse> {
    return this.run((provider) => provider.reflect(input));
  }

  private async run(call: (provider: LlmProvider) => Promise<LlmResponse>): Promise<LlmResponse> {
    if (config.llm.mode === "mock") {
      return call(this.mock);
    }

    if (config.llm.mode === "ollama") {
      return call(this.ollama);
    }

    try {
      if (await this.ollama.available()) {
        return await call(this.ollama);
      }
    } catch (error) {
      console.warn(`Ollama falhou, usando mock: ${(error as Error).message}`);
    }

    const fallback = await call(this.mock);
    return { ...fallback, usedFallback: true };
  }
}

export * from "./types";
