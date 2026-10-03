import { z } from "zod";

export type ToolCapability =
  | "memory.read"
  | "memory.write"
  | "goals.write"
  | "goals.read"
  | "experience.write"
  | "state.read"
  | "skills.write"
  | "time.read"
  | "reminders.read"
  | "reminders.write"
  | "body.read"
  | "body.act";

export interface ToolDefinition<TInput, TOutput> {
  name: string;
  description: string;
  capability: ToolCapability;
  /** Se o LLM pode escolher esta ferramenta no ciclo autônomo. */
  allowLlm: boolean;
  /** Só no chat: fica fora do ciclo autônomo (ex.: ações do corpo, que por enquanto só o usuário pede). */
  chatOnly?: boolean;
  /** Se a ferramenta pode ser usada agora (ex.: o corpo está conectado); sem isso, sempre pode. */
  available?: () => boolean;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  execute(input: TInput): Promise<TOutput>;
}
