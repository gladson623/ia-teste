import { z } from "zod";

export type ToolCapability =
  | "memory.read"
  | "memory.write"
  | "goals.write"
  | "goals.read"
  | "experience.write"
  | "state.read"
  | "skills.write";

export interface ToolDefinition<TInput, TOutput> {
  name: string;
  description: string;
  capability: ToolCapability;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  execute(input: TInput): Promise<TOutput>;
}
