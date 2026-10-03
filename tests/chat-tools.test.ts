import test from "node:test";
import assert from "node:assert/strict";
import { AgentService } from "../src/agent/service";
import { MockLlmProvider } from "../src/llm/mockProvider";
import { OllamaProvider } from "../src/llm/ollamaProvider";
import { LlmContext, LlmResponse } from "../src/llm/types";
import {
  AgentStateStore,
  ConversationRepository,
  ExperienceRepository,
  GoalRepository,
  MemoryRepository,
  ReminderRepository,
  SkillRepository
} from "../src/memory/repositories";
import { defaultPersonality } from "../src/personality/profile";
import { ReflectionService } from "../src/reflection/service";
import { registerButlerTools } from "../src/tools/butlerTools";
import { registerInternalTools } from "../src/tools/internalTools";
import { ToolRegistry } from "../src/tools/registry";
import { createTestDb } from "./helpers";

// Devolve as respostas na ordem e guarda uma cópia do contexto de cada chamada.
class ScriptedLlm extends MockLlmProvider {
  contexts: LlmContext[] = [];

  constructor(private readonly replies: Array<Partial<LlmResponse>>) {
    super();
  }

  async generate(context: LlmContext): Promise<LlmResponse> {
    this.contexts.push({ ...context, messages: [...(context.messages ?? [])] });
    return { provider: "scripted", text: "", usedFallback: false, ...this.replies.shift() };
  }
}

function setup(llm: MockLlmProvider) {
  const { db, cleanup } = createTestDb();
  const store = {
    memory: new MemoryRepository(db),
    goals: new GoalRepository(db),
    experiences: new ExperienceRepository(db),
    skills: new SkillRepository(db),
    stateStore: new AgentStateStore(1000, db)
  };
  const conversation = new ConversationRepository(db);
  const reminders = new ReminderRepository(db);
  const tools = new ToolRegistry();
  registerInternalTools(tools, store);
  registerButlerTools(tools, { reminders });

  const agent = new AgentService({ llm, ...store, tools, reflection: new ReflectionService(), conversation, reminders });
  return { agent, db, cleanup, conversation, reminders, tools, ...store };
}

test("chat executa a ferramenta pedida pelo modelo e devolve o resultado para ele", async () => {
  const llm = new ScriptedLlm([
    { toolCalls: [{ name: "remember", arguments: { type: "knowledge", content: "O usuário se chama Alex." } }] },
    { text: "Prazer, Alex. Guardei seu nome." }
  ]);
  const { agent, memory, cleanup } = setup(llm);

  const result = await agent.chat("meu nome é Alex");

  assert.equal(result.reply, "Prazer, Alex. Guardei seu nome.");
  assert.deepEqual(result.toolsUsed, ["remember"]);
  assert.equal(memory.findByContent("O usuário se chama Alex.")?.type, "knowledge");

  const second = llm.contexts[1].messages ?? [];
  assert.deepEqual(second.map((message) => message.role), ["user", "assistant", "tool"]);
  assert.equal(second[2].toolName, "remember");
  assert.match(second[2].content, /"id"/);

  cleanup();
});

test("chat envia o histórico das mensagens anteriores ao modelo", async () => {
  const llm = new ScriptedLlm([{ text: "Olá!" }, { text: "Você disse oi." }]);
  const { agent, conversation, cleanup } = setup(llm);

  await agent.chat("oi");
  await agent.chat("o que eu disse antes?");

  assert.deepEqual(
    llm.contexts[1].messages?.map((message) => [message.role, message.content]),
    [["user", "oi"], ["assistant", "Olá!"], ["user", "o que eu disse antes?"]]
  );
  assert.equal(conversation.recent().length, 4);

  cleanup();
});

test("chat para de executar ferramentas ao atingir o limite e ainda responde", async () => {
  const call = { toolCalls: [{ name: "get_datetime", arguments: {} }] };
  const llm = new ScriptedLlm([call, call, call, call, call, call, { text: "pronto" }]);
  const { agent, cleanup } = setup(llm);

  const result = await agent.chat("que horas são?");

  assert.equal(result.toolsUsed.length, 5);
  assert.equal(result.reply, "pronto");
  // Com o limite atingido, a chamada seguinte vai sem ferramentas.
  assert.deepEqual(llm.contexts[5].tools, []);

  cleanup();
});

test("lembrete criado por ferramenta dispara uma vez quando vence", async () => {
  const { agent, tools, reminders, conversation, cleanup } = setup(new MockLlmProvider());
  const events: any[] = [];
  agent.on("event", (event) => events.push(event));

  const created = await tools.execute<any, { id: string; dueAt: string }>("create_reminder", { text: "tomar água", inMinutes: 10 });
  assert.equal(agent.fireDueReminders().length, 0);

  const later = new Date(Date.now() + 11 * 60000);
  assert.deepEqual(agent.fireDueReminders(later).map((reminder) => reminder.id), [created.id]);
  assert.equal(agent.fireDueReminders(later).length, 0);

  assert.equal(reminders.list("fired").length, 1);
  assert.deepEqual(events.map((event) => [event.type, event.payload.text]), [["reminder", "tomar água"]]);
  assert.equal(conversation.recent()[0].content, "Lembrete: tomar água");

  await assert.rejects(tools.execute("create_reminder", { text: "sem horário" }));

  cleanup();
});

test("estado do agente persiste a contagem de ciclos entre reinícios", () => {
  const { db, stateStore, cleanup } = setup(new MockLlmProvider());

  stateStore.update({ cycleCount: 7, mode: "automatic", running: true });
  const restarted = new AgentStateStore(1000, db).get();

  assert.equal(restarted.cycleCount, 7);
  assert.equal(restarted.mode, "manual");
  assert.equal(restarted.running, false);

  cleanup();
});

test("OllamaProvider conversa pelo /api/chat com histórico, ferramentas e tool calls", async () => {
  const originalFetch = global.fetch;
  const requests: Array<{ url: string; body: any }> = [];
  global.fetch = (async (url: string, init: { body: string }) => {
    requests.push({ url: String(url), body: JSON.parse(init.body) });
    return {
      ok: true,
      json: async () => ({
        message: { content: "", tool_calls: [{ function: { name: "get_datetime", arguments: {} } }] }
      })
    };
  }) as unknown as typeof fetch;

  try {
    const registry = new ToolRegistry();
    const { db, cleanup } = createTestDb();
    registerButlerTools(registry, { reminders: new ReminderRepository(db) });

    const response = await new OllamaProvider({ baseUrl: "http://ollama.test", model: "fake" }).generate({
      personality: defaultPersonality,
      state: {},
      memories: [],
      goals: [],
      tools: registry.list(),
      messages: [
        { role: "user", content: "oi" },
        { role: "assistant", content: "Olá!" },
        { role: "user", content: "que horas são?" }
      ]
    });

    assert.deepEqual(response.toolCalls, [{ name: "get_datetime", arguments: {} }]);

    const [{ url, body }] = requests;
    assert.equal(url, "http://ollama.test/api/chat");
    assert.deepEqual(body.messages.map((message: any) => message.role), ["system", "user", "assistant", "user"]);

    const reminderTool = body.tools.find((tool: any) => tool.function.name === "create_reminder");
    assert.deepEqual(reminderTool.function.parameters.required, ["text"]);
    assert.equal(reminderTool.function.parameters.properties.inMinutes.type, "number");

    cleanup();
  } finally {
    global.fetch = originalFetch;
  }
});
