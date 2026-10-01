import { Goal, MemoryEntry } from "../memory/types";
import { PersonalityProfile } from "../personality/profile";

export interface LlmContext {
  personality: PersonalityProfile;
  state: Record<string, unknown>;
  memories: MemoryEntry[];
  goals: Goal[];
  tools: Array<{ name: string; description: string; capability: string }>;
  userMessage?: string;
  task?: string;
}

export interface LlmResponse {
  provider: string;
  text: string;
  usedFallback: boolean;
}

export interface LlmProvider {
  name: string;
  available(): Promise<boolean>;
  generate(context: LlmContext): Promise<LlmResponse>;
}
