import { config } from "../config/env";
import { MockLlmProvider } from "./mockProvider";
import { OllamaProvider } from "./ollamaProvider";
import { LlmContext, LlmProvider, LlmResponse } from "./types";

export class ResilientLlm implements LlmProvider {
  name = "resilient";

  private readonly mock = new MockLlmProvider();
  private readonly ollama = new OllamaProvider({
    baseUrl: config.llm.ollamaBaseUrl,
    model: config.llm.ollamaModel
  });

  async available(): Promise<boolean> {
    if (config.llm.mode === "mock") return true;
    if (config.llm.mode === "ollama") return this.ollama.available();
    return (await this.ollama.available()) || this.mock.available();
  }

  async generate(context: LlmContext): Promise<LlmResponse> {
    if (config.llm.mode === "mock") {
      return this.mock.generate(context);
    }

    if (config.llm.mode === "ollama") {
      return this.ollama.generate(context);
    }

    try {
      if (await this.ollama.available()) {
        return this.ollama.generate(context);
      }
    } catch {
      // fallback to mock
    }

    const fallback = await this.mock.generate(context);
    return { ...fallback, usedFallback: true };
  }
}

export * from "./types";
