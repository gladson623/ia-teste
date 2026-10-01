import { EventEmitter } from "node:events";
import { LlmProvider } from "../llm";
import { ExperienceRepository, GoalRepository, MemoryRepository, SkillRepository, AgentStateStore } from "../memory/repositories";
import { defaultPersonality, PersonalityProfile } from "../personality/profile";
import { ReflectionService } from "../reflection/service";
import { ToolRegistry } from "../tools/registry";

interface AgentDeps {
  llm: LlmProvider;
  memory: MemoryRepository;
  goals: GoalRepository;
  experiences: ExperienceRepository;
  skills: SkillRepository;
  stateStore: AgentStateStore;
  tools: ToolRegistry;
  reflection: ReflectionService;
  personality?: PersonalityProfile;
}

export class AgentService extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;

  private readonly personality: PersonalityProfile;

  constructor(private readonly deps: AgentDeps) {
    super();
    this.personality = deps.personality ?? defaultPersonality;
  }

  getState() {
    return this.deps.stateStore.get();
  }

  setIntervalMs(intervalMs: number) {
    this.deps.stateStore.update({ intervalMs });
    this.emitLog("Intervalo atualizado", { intervalMs });
  }

  startAutomatic(intervalMs?: number) {
    if (intervalMs && intervalMs > 0) {
      this.setIntervalMs(intervalMs);
    }

    if (this.timer) clearInterval(this.timer);

    const current = this.getState();
    this.deps.stateStore.update({ mode: "automatic", running: true });
    this.timer = setInterval(() => {
      this.runCycle("automatic").catch((error) => {
        this.emitLog("Erro no ciclo automático", { error: String(error) });
      });
    }, current.intervalMs);

    this.emitLog("Modo automático iniciado", { intervalMs: current.intervalMs });
    return this.getState();
  }

  pauseAutomatic() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.deps.stateStore.update({ running: false, mode: "manual", currentAction: "paused" });
    this.emitLog("Modo automático pausado");
    return this.getState();
  }

  async chat(message: string) {
    const memories = this.deps.memory.recall(message, undefined, 8);
    const goals = this.deps.goals.getActive();

    const response = await this.deps.llm.generate({
      personality: this.personality,
      state: { ...this.getState() },
      memories,
      goals,
      tools: this.deps.tools.list(),
      userMessage: message
    });

    const experience = this.deps.experiences.create({
      action: "chat",
      goalId: goals[0]?.id ?? null,
      result: "Resposta enviada ao usuário",
      observation: message,
      learning: "Interação conversacional processada",
      success: true
    });

    this.emit("event", {
      type: "chat",
      timestamp: new Date().toISOString(),
      payload: { message, response: response.text, provider: response.provider }
    });

    return {
      reply: response.text,
      provider: response.provider,
      usedFallback: response.usedFallback,
      experience
    };
  }

  async runCycle(trigger: "manual" | "automatic" = "manual") {
    const before = this.getState();
    this.deps.stateStore.update({ currentAction: "perceive" });

    const stateSnapshot = {
      cycleCount: before.cycleCount,
      trigger,
      now: new Date().toISOString()
    };

    const goals = this.deps.goals.getActive();
    let selectedGoal: ReturnType<GoalRepository["list"]>[number] | undefined = goals[0];

    if (!selectedGoal) {
      const createdGoal = await this.deps.tools.execute<{ title: string; description: string; priority: number; source: string }, { id: string }>(
        "create_goal",
        {
          title: "Explorar estado atual com segurança",
          description: "Coletar observações e registrar aprendizados sem ações perigosas.",
          priority: 0.6,
          source: "agent"
        }
      );
      selectedGoal = this.deps.goals.list().find((goal) => goal.id === createdGoal.id);
    }

    const planningNote = selectedGoal
      ? `Focar no objetivo: ${selectedGoal.title}`
      : "Sem objetivos definidos; manter observação segura.";

    this.deps.stateStore.update({ currentAction: "execute" });

    const experience = this.deps.experiences.create({
      action: "agent_cycle",
      goalId: selectedGoal?.id ?? null,
      result: planningNote,
      observation: `Estado observado: ${JSON.stringify(stateSnapshot)}`,
      learning: "Ciclos curtos e frequentes ajudam a consolidar memória.",
      success: true
    });

    const reflection = this.deps.reflection.reflect(experience);
    for (const candidate of reflection.memoryCandidates) {
      this.deps.memory.create(candidate);
    }

    for (const suggestion of reflection.goalSuggestions) {
      this.deps.goals.create(suggestion);
    }

    const after = this.deps.stateStore.update({
      currentAction: "idle",
      lastCycleAt: new Date().toISOString(),
      cycleCount: before.cycleCount + 1
    });

    const payload = {
      trigger,
      selectedGoal,
      experience,
      reflection,
      state: after
    };

    this.emit("event", { type: "cycle", timestamp: new Date().toISOString(), payload });
    this.emitLog("Ciclo executado", { trigger, cycleCount: after.cycleCount, goalId: selectedGoal?.id });

    return payload;
  }

  private emitLog(message: string, data?: Record<string, unknown>) {
    this.emit("event", {
      type: "log",
      timestamp: new Date().toISOString(),
      payload: { message, ...(data ?? {}) }
    });
  }
}
