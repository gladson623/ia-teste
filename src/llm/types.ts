import { Goal, MemoryEntry } from "../memory/types";
import { PersonalityProfile } from "../personality/profile";
import type { DecisionInput, ReflectionInput, RepairInput } from "./provider";

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

// Mensagem da conversa. "tool" carrega o resultado de uma ferramenta pedida pelo assistente.
export interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  toolName?: string;
}

export interface LlmContext {
  personality: PersonalityProfile;
  state: Record<string, unknown>;
  memories: MemoryEntry[];
  goals: Goal[];
  // `parameters` é o JSON Schema dos argumentos; com ele o modelo pode chamar a ferramenta durante o chat.
  tools: Array<{ name: string; description: string; capability: string; parameters?: Record<string, unknown> }>;
  userMessage?: string;
  // Situação do corpo virtual (conectado ou não, objetos da sala, o que está na mão), já em texto.
  body?: string;
  task?: string;
  // Conversa a enviar depois do prompt de sistema (histórico + mensagem atual + chamadas de ferramenta em andamento).
  messages?: ChatMessage[];
}

export interface LlmResponse {
  provider: string;
  text: string;
  usedFallback: boolean;
  toolCalls?: ToolCall[];
}

export interface LlmProvider {
  name: string;
  available(): Promise<boolean>;
  generate(context: LlmContext): Promise<LlmResponse>;
  // Saídas estruturadas do ciclo do agente: `text` traz o JSON bruto, validado pelo LlmClient.
  decide(input: DecisionInput): Promise<LlmResponse>;
  repairDecision(input: RepairInput): Promise<LlmResponse>;
  reflect(input: ReflectionInput): Promise<LlmResponse>;
}
