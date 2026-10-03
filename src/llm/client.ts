import { AgentDecision, AgentReflection, DecisionSchema, ReflectionSchema } from "../agent/contracts";
import { DecisionInput, DecisionResult, ReflectionInput, StructuredLlmClient } from "./provider";
import { LlmProvider } from "./types";

const parseDecision = (text: string): { decision: AgentDecision | null; error: string } => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { decision: null, error: (error as Error).message };
  }

  const parsed = DecisionSchema.safeParse(value);
  return parsed.success
    ? { decision: parsed.data, error: "" }
    : { decision: null, error: JSON.stringify(parsed.error.issues) };
};

// Transforma o texto do provider em decisões/reflexões validadas. O modo (mock/ollama/auto) é do provider.
export class LlmClient implements StructuredLlmClient {
  constructor(private readonly provider: LlmProvider) {}

  async decide(input: DecisionInput): Promise<DecisionResult> {
    const first = await this.provider.decide(input);
    const firstParsed = parseDecision(first.text);
    if (firstParsed.decision) {
      return { decision: firstParsed.decision, provider: first.provider, usedFallback: first.usedFallback };
    }

    const second = await this.provider.repairDecision({ ...input, invalidOutput: first.text, error: firstParsed.error });
    const secondParsed = parseDecision(second.text);
    if (secondParsed.decision) {
      return { decision: secondParsed.decision, provider: second.provider, usedFallback: second.usedFallback };
    }

    return {
      decision: null,
      provider: second.provider,
      usedFallback: second.usedFallback,
      error: `invalid_decision_json:${secondParsed.error}`
    };
  }

  // A reflexão é opcional: qualquer falha vira reflexão vazia e o ciclo segue.
  async reflect(input: ReflectionInput): Promise<{ reflection: AgentReflection; provider: string }> {
    try {
      const response = await this.provider.reflect(input);
      const parsed = ReflectionSchema.safeParse(JSON.parse(response.text));
      return { reflection: parsed.success ? parsed.data : {}, provider: response.provider };
    } catch {
      return { reflection: {}, provider: this.provider.name };
    }
  }
}
