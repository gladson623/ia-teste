import { ZodError } from 'zod';
import { AgentDecision, AgentReflection, DecisionSchema, ReflectionSchema } from '../agent/contracts.js';
import { LlmProvider, StructuredLlmClient } from './provider.js';

const parseJson = (input: string) => {
  try {
    return { value: JSON.parse(input), error: null as string | null };
  } catch (error) {
    return { value: null, error: (error as Error).message };
  }
};

const zodError = (error: unknown) => {
  if (error instanceof ZodError) {
    return JSON.stringify(error.issues);
  }
  return String(error);
};

export class LlmClient implements StructuredLlmClient {
  constructor(
    private readonly primary: LlmProvider,
    private readonly fallback: LlmProvider
  ) {}

  private async withFallback<T>(handler: (provider: LlmProvider) => Promise<T>): Promise<{ value: T; provider: string }> {
    try {
      return { value: await handler(this.primary), provider: this.primary.name };
    } catch {
      return { value: await handler(this.fallback), provider: this.fallback.name };
    }
  }

  async decide(context: unknown): Promise<{ decision: AgentDecision | null; provider: string; error?: string }> {
    const first = await this.withFallback((provider) => provider.decide({ context }));
    const firstParsed = parseJson(first.value);

    if (firstParsed.value) {
      try {
        return { decision: DecisionSchema.parse(firstParsed.value), provider: first.provider };
      } catch (error) {
        const second = await this.withFallback((provider) =>
          provider.repairDecision({
            context,
            invalidOutput: first.value,
            error: zodError(error)
          })
        );
        const secondParsed = parseJson(second.value);
        if (secondParsed.value) {
          try {
            return { decision: DecisionSchema.parse(secondParsed.value), provider: second.provider };
          } catch (secondError) {
            return { decision: null, provider: second.provider, error: `invalid_decision_json:${zodError(secondError)}` };
          }
        }

        return { decision: null, provider: second.provider, error: `invalid_decision_json:${secondParsed.error}` };
      }
    }

    const second = await this.withFallback((provider) =>
      provider.repairDecision({
        context,
        invalidOutput: first.value,
        error: firstParsed.error ?? 'invalid_json'
      })
    );
    const secondParsed = parseJson(second.value);
    if (!secondParsed.value) {
      return { decision: null, provider: second.provider, error: `invalid_decision_json:${secondParsed.error}` };
    }

    try {
      return { decision: DecisionSchema.parse(secondParsed.value), provider: second.provider };
    } catch (error) {
      return { decision: null, provider: second.provider, error: `invalid_decision_json:${zodError(error)}` };
    }
  }

  async reflect(context: unknown): Promise<{ reflection: AgentReflection; provider: string }> {
    const response = await this.withFallback((provider) => provider.reflect(context));
    const parsed = parseJson(response.value);
    if (!parsed.value) {
      return { reflection: {}, provider: response.provider };
    }

    try {
      return { reflection: ReflectionSchema.parse(parsed.value), provider: response.provider };
    } catch {
      return { reflection: {}, provider: response.provider };
    }
  }
}
