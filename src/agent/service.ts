import { EventEmitter } from "node:events";
import { config } from "../config/env";
import { ChatMessage, LlmProvider } from "../llm";
import { LlmClient } from "../llm/client";
import { ConversationRepository, ReminderRepository } from "../memory/repositories";
import { defaultPersonality, PersonalityProfile } from "../personality/profile";
import { ReflectionService } from "../reflection/service";
import { ToolRegistry } from "../tools/registry";
import { clip } from "./context";
import { AgentLoop } from "./loop";
import { AgentStore } from "./store";

interface AgentDeps extends AgentStore {
  llm: LlmProvider;
  tools: ToolRegistry;
  reflection: ReflectionService;
  personality?: PersonalityProfile;
  // Opcionais: sem `conversation` o chat não tem histórico; sem `reminders` nenhum lembrete é disparado.
  conversation?: ConversationRepository;
  reminders?: ReminderRepository;
  // Corpo virtual: `describe` conta ao modelo a situação do corpo (sem isso ele não sabe que tem um);
  // `wantsAction` diz se a mensagem do usuário pede uma ação do corpo.
  body?: { describe(): string; wantsAction(message: string): boolean };
}

export class AgentService extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;

  private reminderTimer: NodeJS.Timeout | null = null;

  private readonly personality: PersonalityProfile;

  private readonly loop: AgentLoop;

  constructor(private readonly deps: AgentDeps) {
    super();
    this.personality = deps.personality ?? defaultPersonality;
    this.loop = new AgentLoop(deps, new LlmClient(deps.llm), deps.tools, deps.reflection, this.personality);
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

    const timerMs = Math.max(this.getState().intervalMs, config.minCycleIntervalMs);
    this.loop.resetCycleBudget();
    this.deps.stateStore.update({ mode: "automatic", running: true });
    this.timer = setInterval(() => {
      this.runCycle("automatic").catch((error) => {
        this.emitLog("Erro no ciclo automático", { error: String(error) });
      });
    }, timerMs);

    this.emitLog("Modo automático iniciado", { intervalMs: timerMs });
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

  // Verifica periodicamente os lembretes vencidos e avisa pelo evento "reminder".
  startReminders(intervalMs = config.reminderCheckMs) {
    if (this.reminderTimer) clearInterval(this.reminderTimer);
    this.reminderTimer = setInterval(() => this.fireDueReminders(), intervalMs);
    this.reminderTimer.unref();
  }

  stopReminders() {
    if (this.reminderTimer) clearInterval(this.reminderTimer);
    this.reminderTimer = null;
  }

  fireDueReminders(at: Date = new Date()) {
    const due = this.deps.reminders?.due(at) ?? [];
    for (const reminder of due) {
      this.deps.reminders?.markFired(reminder.id);
      // O aviso entra na conversa para o Mordomo saber, nas próximas mensagens, que já lembrou o usuário.
      this.deps.conversation?.add("assistant", `Lembrete: ${reminder.text}`);
      this.emit("event", { type: "reminder", timestamp: new Date().toISOString(), payload: reminder });
    }
    return due;
  }

  async chat(message: string) {
    const memories = this.deps.memory.recall(message, undefined, 8);
    const goals = this.deps.goals.getActive();
    const tools = this.deps.tools.list().filter((tool) => tool.allowLlm);

    const history: ChatMessage[] = (this.deps.conversation?.recent(config.chat.historyLimit) ?? []).map((entry) => ({
      role: entry.role,
      content: entry.content
    }));
    const messages: ChatMessage[] = [...history, { role: "user", content: message }];
    // toolsUsed: ferramentas que executaram; toolErrors: chamadas que falharam (ex.: argumentos inválidos).
    const toolsUsed: string[] = [];
    const toolErrors: string[] = [];
    let toolCallCount = 0;

    const ask = (withTools: boolean) =>
      this.deps.llm.generate({
        personality: this.personality,
        state: { ...this.getState() },
        memories,
        goals,
        tools: withTools ? tools : [],
        userMessage: message,
        // Lido a cada chamada: o que está na mão muda depois de uma ferramenta do corpo.
        body: this.deps.body?.describe(),
        messages
      });

    // O modelo pode pedir ferramentas antes de responder; cada resultado volta para ele como mensagem "tool".
    let response = await ask(true);

    // Modelos pequenos às vezes respondem "estou indo" (ou imitam uma recusa antiga do histórico) sem chamar a
    // ferramenta: nesse caso pergunta de novo só com a mensagem atual, sem o histórico.
    if (!response.toolCalls?.length && this.deps.body?.wantsAction(message)) {
      messages.splice(0, messages.length - 1);
      response = await ask(true);
    }

    while (response.toolCalls?.length) {
      messages.push({ role: "assistant", content: response.text, toolCalls: response.toolCalls });

      for (const call of response.toolCalls) {
        let output: string;
        if (toolCallCount >= config.chat.maxToolCalls) {
          output = "Limite de ferramentas por mensagem atingido; responda ao usuário com o que já tem.";
        } else if (!this.deps.tools.get(call.name)?.allowLlm) {
          output = `Ferramenta não permitida: ${call.name}`;
        } else {
          toolCallCount += 1;
          try {
            output = JSON.stringify(await this.deps.tools.execute(call.name, call.arguments));
            toolsUsed.push(call.name);
          } catch (error) {
            output = `Erro: ${error instanceof Error ? error.message : String(error)}. Corrija os argumentos e chame de novo.`;
            toolErrors.push(`${call.name}: ${clip(output)}`);
          }
          this.emitLog("Ferramenta chamada no chat", { tool: call.name, arguments: call.arguments, output: clip(output) });
        }
        messages.push({ role: "tool", toolName: call.name, content: clip(output, 2000) });
      }

      // Atingido o limite, a próxima chamada vai sem ferramentas para forçar a resposta final.
      response = await ask(toolCallCount < config.chat.maxToolCalls);
    }

    this.deps.conversation?.add("user", message);
    this.deps.conversation?.add("assistant", response.text);

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
      payload: { message, response: response.text, provider: response.provider, toolsUsed, toolErrors }
    });

    return {
      reply: response.text,
      provider: response.provider,
      usedFallback: response.usedFallback,
      toolsUsed,
      toolErrors,
      experience
    };
  }

  async runCycle(trigger: "manual" | "automatic" = "manual") {
    const result = await this.loop.runCycle();

    if (result.blocked === "max_cycles_reached" && this.timer) {
      this.pauseAutomatic();
    }

    const payload = { trigger, ...result, state: this.getState() };

    this.emit("event", { type: "cycle", timestamp: new Date().toISOString(), payload });
    this.emitLog(result.executed ? "Ciclo executado" : "Ciclo sem execução", {
      trigger,
      cycleCount: payload.state.cycleCount,
      provider: result.provider,
      tool: result.tool,
      thought: result.decision?.thought_summary,
      blocked: result.blocked,
      error: result.error
    });

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
