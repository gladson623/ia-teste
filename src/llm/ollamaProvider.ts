import { DecisionInput, ReflectionInput, RepairInput } from "./provider";
import { ChatMessage, LlmContext, LlmProvider, LlmResponse, ToolCall } from "./types";

interface OllamaConfig {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 120000;

const DECISION_FORMAT =
  '{"thought_summary": "resumo operacional curto", "goal": "título do objetivo relacionado", "action": {"tool": "nome_da_ferramenta", "arguments": {}}, "reason": "motivo da ação"}';

const REFLECTION_FORMAT =
  '{"learning": "o que foi aprendido", "memory_to_create": "", "goal_to_create": "", "skill_to_update": ""}';

// Modelos pequenos às vezes escrevem a chamada no texto em vez de usar o tool calling nativo, ex.:
// pick_up({"target": "red_box"}), pick_up(red_box), pick_up(target="red_box") ou pick_up {"target": "red_box"}.
// Só valem ferramentas oferecidas.
export function parseWrittenToolCalls(
  content: string,
  tools: Array<{ name: string; parameters?: Record<string, unknown> }>
): ToolCall[] {
  if (tools.length === 0) return [];

  const calls: ToolCall[] = [];
  const pattern = new RegExp(`\\b(${tools.map((tool) => tool.name).join("|")})\\s*(?:\\(([^()]*)\\)|(\\{[^{}]*\\}))`, "g");
  for (const match of content.matchAll(pattern)) {
    const tool = tools.find((item) => item.name === match[1])!;
    const args = parseWrittenArguments((match[2] ?? match[3]).trim(), Object.keys((tool.parameters?.properties as object | undefined) ?? {}));
    if (args) calls.push({ name: tool.name, arguments: args });
  }
  return calls;
}

// `names` são os parâmetros da ferramenta, na ordem: valores sem nome são atribuídos a eles pela posição.
function parseWrittenArguments(text: string, names: string[]): Record<string, unknown> | null {
  if (!text) return {};

  if (text.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(text);
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  const args: Record<string, unknown> = {};
  const parts = text.split(",").map((part) => part.trim());
  for (const [index, part] of parts.entries()) {
    const named = part.match(/^["']?(\w+)["']?\s*[=:]\s*(.+)$/);
    const key = named ? named[1] : names[index];
    const value = (named ? named[2] : part).trim().replace(/^["']|["']$/g, "");
    if (!key || !names.includes(key) || !value) return null;
    args[key] = /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value;
  }
  return args;
}

export class OllamaProvider implements LlmProvider {
  name = "ollama";

  constructor(private readonly config: OllamaConfig) {}

  async available(): Promise<boolean> {
    if (!this.config.baseUrl || !this.config.model) return false;

    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(2000)
      });
      if (!response.ok) return false;

      const payload = (await response.json()) as { models?: Array<{ name?: string }> };
      return (payload.models ?? []).some((model) => this.isConfiguredModel(model.name));
    } catch {
      return false;
    }
  }

  // Conversa pelo /api/chat: leva o histórico e deixa o modelo pedir ferramentas (tool calling nativo).
  async generate(context: LlmContext): Promise<LlmResponse> {
    const conversation: ChatMessage[] = context.messages ?? [
      { role: "user", content: context.userMessage ?? `Tarefa interna: ${context.task ?? "responder de forma útil"}` }
    ];
    const tools = context.tools
      .filter((tool) => tool.parameters)
      .map((tool) => ({
        type: "function",
        function: { name: tool.name, description: tool.description, parameters: tool.parameters }
      }));

    const history = conversation.map((message) => ({
      role: message.role as string,
      content: message.content,
      ...(message.toolCalls
        ? { tool_calls: message.toolCalls.map((call) => ({ function: { name: call.name, arguments: call.arguments } })) }
        : {}),
      ...(message.toolName ? { tool_name: message.toolName } : {})
    }));

    // A situação do corpo vai logo antes da última mensagem do usuário: longe dela, modelos pequenos
    // imitam as respostas antigas do histórico em vez de agir.
    const lastUser = conversation.map((message) => message.role).lastIndexOf("user");
    if (context.body && lastUser >= 0) {
      history.splice(lastUser, 0, { role: "system", content: context.body });
    }

    const payload = (await this.post("/api/chat", {
      messages: [{ role: "system", content: this.buildSystemPrompt(context) }, ...history],
      // Temperatura baixa: o modelo fica mais constante na hora de chamar ferramentas.
      options: { temperature: 0.2 },
      ...(tools.length > 0 ? { tools } : {})
    })) as { message?: { content?: string; tool_calls?: Array<{ function?: { name?: string; arguments?: unknown } }> } };

    const toolCalls: ToolCall[] = (payload.message?.tool_calls ?? [])
      .filter((call) => call.function?.name)
      .map((call) => ({
        name: call.function!.name!,
        arguments: (typeof call.function!.arguments === "object" && call.function!.arguments !== null
          ? call.function!.arguments
          : {}) as Record<string, unknown>
      }));

    const content = payload.message?.content?.trim() || "";
    if (toolCalls.length === 0) {
      const written = parseWrittenToolCalls(content, tools.map((tool) => tool.function));
      // O texto em volta é descartado: costuma narrar um resultado que ainda não aconteceu.
      if (written.length > 0) return { provider: this.name, text: "", usedFallback: false, toolCalls: written };
    }

    return {
      provider: this.name,
      text: content,
      usedFallback: false,
      ...(toolCalls.length > 0 ? { toolCalls } : {})
    };
  }

  async decide(input: DecisionInput): Promise<LlmResponse> {
    return this.request({
      system: this.buildDecisionPrompt(input),
      prompt: this.buildDecisionContext(input),
      format: "json"
    });
  }

  async repairDecision(input: RepairInput): Promise<LlmResponse> {
    return this.request({
      system: this.buildDecisionPrompt(input),
      prompt: [
        this.buildDecisionContext(input),
        `Sua resposta anterior foi rejeitada: ${input.invalidOutput}`,
        `Erro de validação: ${input.error}`,
        "Responda novamente, somente com o JSON corrigido."
      ].join("\n"),
      format: "json"
    });
  }

  async reflect(input: ReflectionInput): Promise<LlmResponse> {
    const { personality, ...outcome } = input;

    return this.request({
      system: [
        `Você é ${personality.name}, um agente autônomo, refletindo sobre a ação que acabou de executar.`,
        "Responda SOMENTE com um objeto JSON neste formato:",
        REFLECTION_FORMAT,
        "Regras: learning é uma frase curta em português.",
        'Os outros campos são opcionais; use "" quando não houver nada útil.',
        "memory_to_create: uma frase completa com um fato novo e duradouro (nunca só um tema ou título); deixe \"\" se a ação já gravou a informação ou se não há nada novo.",
        "goal_to_create: título de um novo objetivo, somente se necessário e diferente dos objetivos ativos.",
        "skill_to_update: nome de uma skill existente que foi exercitada."
      ].join("\n"),
      prompt: `Ação executada:\n${JSON.stringify(outcome)}`,
      format: "json"
    });
  }

  private async request(body: { system: string; prompt: string; format?: "json" }): Promise<LlmResponse> {
    const payload = (await this.post("/api/generate", body)) as { response?: string };

    return {
      provider: this.name,
      text: payload.response?.trim() || "",
      usedFallback: false
    };
  }

  private async post(path: string, body: Record<string, unknown>): Promise<unknown> {
    if (!this.config.baseUrl || !this.config.model) {
      throw new Error("Ollama não configurado");
    }

    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let response: Response;

    try {
      response = await fetch(`${this.config.baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.config.model, ...body, stream: false }),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      if ((error as Error).name === "TimeoutError") {
        throw new Error(`Ollama não respondeu em ${timeoutMs}ms (ajuste OLLAMA_TIMEOUT_MS)`);
      }
      throw new Error(`Ollama inacessível em ${this.config.baseUrl}: ${(error as Error).message}`);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      if (response.status === 404) {
        throw new Error(`Modelo "${this.config.model}" não encontrado no Ollama (rode: ollama pull ${this.config.model})`);
      }
      throw new Error(`Falha Ollama: ${response.status} ${detail}`.trim());
    }

    return response.json();
  }

  // Ollama trata nome sem tag como ":latest".
  private isConfiguredModel(installed?: string): boolean {
    const wanted = this.config.model ?? "";
    return installed === wanted || installed === `${wanted}:latest`;
  }

  private buildSystemPrompt(context: LlmContext): string {
    const now = new Date();
    return [
      `Você é ${context.personality.name}, um mordomo virtual e assistente pessoal. Apresente-se sempre como ${context.personality.name}.`,
      `Características: ${context.personality.traits.join(", ")}.`,
      `Agora: ${now.toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" })} (ISO ${now.toISOString()}).`,
      `Memórias relevantes: ${JSON.stringify(context.memories.map((m) => ({ type: m.type, content: m.content, tags: m.tags })))}`,
      `Objetivos: ${JSON.stringify(context.goals.map((goal) => ({ id: goal.id, title: goal.title, status: goal.status, priority: goal.priority })))}`,
      "Use as ferramentas quando ajudarem: remember para guardar fatos duradouros que o usuário contar (nome, preferências, projetos), recall para buscar o que você não lembra, create_reminder quando ele pedir para ser lembrado de algo.",
      "Não diga que guardou, lembrou ou agendou algo sem ter chamado a ferramenta correspondente.",
      "Responda em português de forma curta, educada e objetiva."
    ].join("\n");
  }

  // Modelos pequenos ignoram a regra genérica de não repetir; a última ação vai explícita no fim do prompt.
  private buildDecisionContext(input: DecisionInput): string {
    const last = input.context.recentExperiences[0];
    const lines = [`Contexto atual:\n${JSON.stringify(input.context)}`];

    if (last?.action === "chat") {
      lines.push(`O usuário acabou de dizer: "${last.observation}". Aja em função disso.`);
    } else if (last) {
      lines.push(`Experiência mais recente: ${last.action} — ${last.result} (${last.observation}). Não repita essa ação; escolha uma diferente.`);
    }

    return lines.join("\n");
  }

  private buildDecisionPrompt(input: DecisionInput): string {
    return [
      `Você é ${input.personality.name}, um agente autônomo. Características: ${input.personality.traits.join(", ")}.`,
      "A cada ciclo você escolhe UMA ação: chamar exatamente uma das ferramentas permitidas para avançar nos objetivos ativos.",
      "Ferramentas permitidas (nome: descrição | argumentos):",
      ...input.tools.map((tool) => `- ${tool.name}: ${tool.description} | ${tool.arguments}`),
      "Responda SOMENTE com um objeto JSON neste formato:",
      DECISION_FORMAT,
      "Regras:",
      "- use somente ferramentas da lista, com os nomes e tipos de argumentos exatos (\"?\" marca argumento opcional);",
      "- use apenas ids que aparecem no contexto;",
      "- experiências com action \"chat\" são mensagens do usuário (o texto está em observation) e têm prioridade: guarde com remember os fatos que ele contou e crie ou ajuste objetivos para ajudá-lo;",
      "- se não houver objetivo ativo, crie um ligado ao que o usuário disse ou às memórias; não invente assuntos sem relação com o contexto;",
      "- recentExperiences mostra o que você já fez (argumentos => resultado): não repita essas ações;",
      "- não crie objetivo, memória ou skill que já exista no contexto; prefira atualizar com update_goal/update_skill;",
      "- quando um objetivo já estiver cumprido, conclua-o com complete_goal;",
      "- thought_summary e reason são frases curtas em português."
    ].join("\n");
  }
}
