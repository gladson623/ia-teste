import { LlmContext, LlmProvider, LlmResponse } from "./types";

interface OllamaConfig {
  baseUrl?: string;
  model?: string;
}

export class OllamaProvider implements LlmProvider {
  name = "ollama";

  constructor(private readonly config: OllamaConfig) {}

  async available(): Promise<boolean> {
    if (!this.config.baseUrl || !this.config.model) return false;

    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(800)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async generate(context: LlmContext): Promise<LlmResponse> {
    if (!this.config.baseUrl || !this.config.model) {
      throw new Error("Ollama não configurado");
    }

    const prompt = this.buildPrompt(context);
    const response = await fetch(`${this.config.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.config.model,
        prompt,
        stream: false
      }),
      signal: AbortSignal.timeout(6000)
    });

    if (!response.ok) {
      throw new Error(`Falha Ollama: ${response.status}`);
    }

    const payload = (await response.json()) as { response?: string };

    return {
      provider: this.name,
      text: payload.response?.trim() || "",
      usedFallback: false
    };
  }

  private buildPrompt(context: LlmContext): string {
    return [
      `Você é ${context.personality.name}.`,
      `Características: ${context.personality.traits.join(", ")}.`,
      `Estado: ${JSON.stringify(context.state)}.`,
      `Memórias relevantes: ${JSON.stringify(context.memories.map((m) => ({ type: m.type, content: m.content, tags: m.tags })))}`,
      `Objetivos: ${JSON.stringify(context.goals.map((goal) => ({ title: goal.title, status: goal.status, priority: goal.priority })))}`,
      `Ferramentas disponíveis: ${JSON.stringify(context.tools)}.`,
      context.userMessage ? `Mensagem do usuário: ${context.userMessage}` : `Tarefa interna: ${context.task ?? "responder de forma útil"}`,
      "Responda em português de forma curta, segura e objetiva."
    ].join("\n");
  }
}
