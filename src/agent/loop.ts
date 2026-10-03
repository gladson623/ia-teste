import { config } from "../config/env";
import { StructuredLlmClient } from "../llm/provider";
import { Experience } from "../memory/types";
import { PersonalityProfile } from "../personality/profile";
import { ReflectionResult, ReflectionService } from "../reflection/service";
import { ToolRegistry } from "../tools/registry";
import { clip, getRelevantContext } from "./context";
import { AgentDecision } from "./contracts";
import { AgentStore } from "./store";

export interface CycleResult {
  executed: boolean;
  blocked?: string;
  error?: string;
  provider?: string;
  usedFallback?: boolean;
  tool?: string;
  decision?: AgentDecision;
  experience?: Experience;
  reflection?: ReflectionResult;
}

export class AgentLoop {
  private cyclesSinceStart = 0;
  private cycleInProgress = false;
  private lastCycleAt = 0;
  // Assinatura (tool + argumentos) -> momento da execução, para o cooldown de ações repetidas.
  private readonly recentActions = new Map<string, number>();

  constructor(
    private readonly store: AgentStore,
    private readonly llm: StructuredLlmClient,
    private readonly tools: ToolRegistry,
    private readonly reflection: ReflectionService,
    private readonly personality: PersonalityProfile
  ) {}

  resetCycleBudget() {
    this.cyclesSinceStart = 0;
  }

  async runCycle(): Promise<CycleResult> {
    if (this.cycleInProgress) {
      return { executed: false, blocked: "cycle_in_progress" };
    }
    if (this.cyclesSinceStart >= config.maxCycles) {
      return { executed: false, blocked: "max_cycles_reached" };
    }
    // Cada ciclo executa no máximo uma ferramenta; abaixo de 1 nenhuma execução é permitida.
    if (config.maxToolCallsPerCycle < 1) {
      return { executed: false, blocked: "max_tool_calls_per_cycle" };
    }
    if (Date.now() - this.lastCycleAt < config.minCycleIntervalMs) {
      return { executed: false, blocked: "min_cycle_interval" };
    }

    this.cycleInProgress = true;
    this.lastCycleAt = Date.now();
    this.cyclesSinceStart += 1;

    try {
      return await this.decideAndAct();
    } finally {
      this.cycleInProgress = false;
      this.store.stateStore.update({
        currentAction: "idle",
        lastCycleAt: new Date().toISOString(),
        cycleCount: this.store.stateStore.get().cycleCount + 1
      });
    }
  }

  private async decideAndAct(): Promise<CycleResult> {
    // O contexto é montado antes de marcar a fase: o LLM lê o estado e trataria a fase como nome de ferramenta.
    const context = getRelevantContext(this.store);
    const allowedTools = this.tools
      .list()
      .filter((tool) => tool.allowLlm && !tool.chatOnly)
      .map((tool) => ({ name: tool.name, description: tool.description, arguments: tool.arguments }));

    this.store.stateStore.update({ currentAction: "decide" });
    const { decision, provider, usedFallback, error } = await this.llm.decide({
      personality: this.personality,
      context,
      tools: allowedTools
    });

    if (!decision) {
      const experience = this.store.experiences.create({
        action: "decision_validation",
        goalId: null,
        result: "Decisão do LLM inválida; nenhuma ferramenta executada",
        observation: clip(error ?? "invalid_decision_json"),
        learning: "",
        success: false
      });
      return { executed: false, provider, usedFallback, error, experience };
    }

    const toolName = decision.action.tool;
    const goalId = context.activeGoals.find((goal) => goal.id === decision.goal || goal.title === decision.goal)?.id ?? null;
    const outcome = { provider, usedFallback, tool: toolName, decision };

    const reject = (reason: string): CycleResult => {
      const experience = this.store.experiences.create({
        action: toolName,
        goalId,
        result: `Ação não executada: ${reason}`,
        observation: decision.thought_summary,
        learning: decision.reason,
        success: false
      });
      return { ...outcome, executed: false, blocked: reason, experience };
    };

    const tool = this.tools.get(toolName);
    if (!tool) return reject("tool_not_found");
    if (!tool.allowLlm || tool.chatOnly) return reject("tool_not_permitted");

    const signature = `${toolName}:${JSON.stringify(decision.action.arguments)}`;
    for (const [recent, executedAt] of this.recentActions) {
      if (Date.now() - executedAt >= config.actionCooldownMs) this.recentActions.delete(recent);
    }
    if (this.recentActions.has(signature)) {
      return reject("action_cooldown");
    }

    this.store.stateStore.update({ currentAction: `execute:${toolName}` });
    this.recentActions.set(signature, Date.now());

    let success = true;
    let output: string;
    try {
      // O registry valida os argumentos contra o schema da ferramenta antes de executar.
      output = JSON.stringify(await this.tools.execute(toolName, decision.action.arguments));
    } catch (toolError) {
      success = false;
      output = toolError instanceof Error ? toolError.message : String(toolError);
    }
    // Argumentos + saída: é o que o LLM vê nos próximos ciclos para não repetir a ação.
    const observation = `${clip(JSON.stringify(decision.action.arguments))} => ${clip(output)}`;

    const experience = this.store.experiences.create({
      action: toolName,
      goalId,
      result: success ? "Ferramenta executada com sucesso" : "Falha ao executar a ferramenta",
      observation,
      learning: decision.reason,
      success
    });

    this.store.stateStore.update({ currentAction: "reflect" });
    const { reflection: insight } = await this.llm.reflect({
      personality: this.personality,
      action: toolName,
      arguments: decision.action.arguments,
      goal: decision.goal,
      reason: decision.reason,
      success,
      result: observation,
      activeGoals: context.activeGoals.map((goal) => goal.title),
      skills: context.relevantSkills.map((skill) => skill.name)
    });

    const reflection = this.reflection.reflect(experience, insight);
    this.applyReflection(reflection, insight.skill_to_update?.trim());

    return { ...outcome, executed: success, error: success ? undefined : observation, experience, reflection };
  }

  // Grava o que a reflexão sugeriu, sem duplicar memórias e objetivos ativos já existentes.
  private applyReflection(reflection: ReflectionResult, skillRef?: string) {
    for (const candidate of reflection.memoryCandidates) {
      if (!this.store.memory.findByContent(candidate.content)) this.store.memory.create(candidate);
    }

    const activeTitles = new Set(this.store.goals.getActive().map((goal) => goal.title));
    for (const suggestion of reflection.goalSuggestions) {
      if (!activeTitles.has(suggestion.title)) this.store.goals.create(suggestion);
    }

    if (skillRef) {
      const skill = this.store.skills.list().find((item) => item.id === skillRef || item.name === skillRef);
      // update() sem patch apenas marca a skill como usada (lastUsedAt).
      if (skill) this.store.skills.update(skill.id, {});
    }
  }
}
