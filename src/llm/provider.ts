import { AgentDecision, AgentReflection } from '../agent/contracts.js';

export interface LlmProvider {
  readonly name: string;
  decide(input: unknown): Promise<string>;
  repairDecision(input: { context: unknown; invalidOutput: string; error: string }): Promise<string>;
  reflect(input: unknown): Promise<string>;
}

export interface StructuredLlmClient {
  decide(context: unknown): Promise<{ decision: AgentDecision | null; provider: string; error?: string }>;
  reflect(context: unknown): Promise<{ reflection: AgentReflection; provider: string }>;
}
