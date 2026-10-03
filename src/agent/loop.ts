import { env } from '../config/env.js';
import { defaultPersonality } from '../personality/defaultPersonality.js';
import { ToolRegistry } from '../tools/registry.js';
import { LlmClient } from '../llm/client.js';
import { getRelevantContext } from './context.js';
import { AgentStore } from './store.js';

export interface CycleResult {
  executed: boolean;
  blocked?: string;
  provider?: string;
  tool?: string;
  error?: string;
}

export class AgentLoop {
  private cyclesSinceStart = 0;

  constructor(
    private readonly store: AgentStore,
    private readonly llm: LlmClient,
    private readonly tools: ToolRegistry
  ) {}

  private actionSignature(tool: string, args: unknown) {
    return `${tool}:${JSON.stringify(args)}`;
  }

  async runCycle(): Promise<CycleResult> {
    if (this.cyclesSinceStart >= env.maxCycles) {
      return { executed: false, blocked: 'max_cycles_reached' };
    }
    if (env.maxToolCallsPerCycle < 1) {
      return { executed: false, blocked: 'max_tool_calls_per_cycle' };
    }

    const context = getRelevantContext(this.store);
    const llmContext = {
      ...context,
      personality: defaultPersonality,
      allowedTools: this.tools.list().filter((t) => t.allowLlm).map((t) => t.name)
    };

    const decisionResult = await this.llm.decide(llmContext);
    if (!decisionResult.decision) {
      this.store.recordExperience({
        action: 'decision_validation',
        result: 'failure',
        observation: decisionResult.error
      });
      return { executed: false, provider: decisionResult.provider, error: decisionResult.error };
    }

    const signature = this.actionSignature(decisionResult.decision.action.tool, decisionResult.decision.action.arguments);
    const now = Date.now();
    if (this.store.state.lastActionSignature === signature && now - (this.store.state.lastActionAt ?? 0) < env.actionCooldownMs) {
      this.store.recordExperience({
        action: decisionResult.decision.action.tool,
        goal: decisionResult.decision.goal,
        result: 'blocked',
        observation: 'action_cooldown'
      });
      return { executed: false, blocked: 'action_cooldown', provider: decisionResult.provider, tool: decisionResult.decision.action.tool };
    }

    const tool = this.tools.get(decisionResult.decision.action.tool);
    if (!tool) {
      this.store.recordExperience({
        action: decisionResult.decision.action.tool,
        goal: decisionResult.decision.goal,
        result: 'rejected',
        observation: 'tool_not_found'
      });
      return { executed: false, blocked: 'tool_not_found', provider: decisionResult.provider, tool: decisionResult.decision.action.tool };
    }

    if (!tool.allowLlm) {
      this.store.recordExperience({
        action: tool.name,
        goal: decisionResult.decision.goal,
        result: 'rejected',
        observation: 'tool_not_permitted'
      });
      return { executed: false, blocked: 'tool_not_permitted', provider: decisionResult.provider, tool: tool.name };
    }

    const output = tool.execute(decisionResult.decision.action.arguments);
    this.cyclesSinceStart += 1;
    this.store.state.cycleCount += 1;
    this.store.state.lastActionSignature = signature;
    this.store.state.lastActionAt = now;

    const exp = this.store.recordExperience({
      action: tool.name,
      goal: decisionResult.decision.goal,
      result: 'success',
      observation: JSON.stringify(output),
      learning: decisionResult.decision.reason
    });

    const reflectionResult = await this.llm.reflect({
      action: tool.name,
      result: exp.result,
      goal: decisionResult.decision.goal,
      context: getRelevantContext(this.store)
    });

    if (reflectionResult.reflection.memory_to_create?.trim()) {
      this.store.remember(reflectionResult.reflection.memory_to_create, 4, ['reflection']);
    }

    if (reflectionResult.reflection.goal_to_create?.trim()) {
      this.store.createGoal(reflectionResult.reflection.goal_to_create, 3);
    }

    if (reflectionResult.reflection.skill_to_update?.trim()) {
      this.store.updateSkill(reflectionResult.reflection.skill_to_update, { description: reflectionResult.reflection.learning ?? '' });
    }

    return { executed: true, provider: decisionResult.provider, tool: tool.name };
  }
}
