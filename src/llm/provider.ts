import type { AgentContext } from "../agent/context";
import type { AgentDecision, AgentReflection } from "../agent/contracts";
import type { PersonalityProfile } from "../personality/profile";

export type { LlmProvider } from "./types";

export interface DecisionInput {
  personality: PersonalityProfile;
  context: AgentContext;
  tools: Array<{ name: string; description: string; arguments: string }>;
}

export interface RepairInput extends DecisionInput {
  invalidOutput: string;
  error: string;
}

export interface ReflectionInput {
  personality: PersonalityProfile;
  action: string;
  arguments: Record<string, unknown>;
  goal: string;
  reason: string;
  success: boolean;
  result: string;
  activeGoals: string[];
  skills: string[];
}

export interface DecisionResult {
  decision: AgentDecision | null;
  provider: string;
  usedFallback: boolean;
  error?: string;
}

export interface StructuredLlmClient {
  decide(input: DecisionInput): Promise<DecisionResult>;
  reflect(input: ReflectionInput): Promise<{ reflection: AgentReflection; provider: string }>;
}
