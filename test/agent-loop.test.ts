import test, { TestContext } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { AgentService } from "../src/agent/service";
import { config } from "../src/config/env";
import { MockLlmProvider } from "../src/llm/mockProvider";
import { OllamaProvider } from "../src/llm/ollamaProvider";
import { LlmProvider, LlmResponse } from "../src/llm/types";
import {
  AgentStateStore,
  ExperienceRepository,
  GoalRepository,
  MemoryRepository,
  SkillRepository
} from "../src/memory/repositories";
import { ReflectionService } from "../src/reflection/service";
import { registerInternalTools } from "../src/tools/internalTools";
import { ToolRegistry } from "../src/tools/registry";
import { createTestDb } from "../tests/helpers";

// Os testes rodam ciclos em sequência, sem esperar o intervalo mínimo entre eles.
config.minCycleIntervalMs = 0;

const decision = (tool: string, args: Record<string, unknown> = {}) =>
  JSON.stringify({ thought_summary: "x", goal: "y", action: { tool, arguments: args }, reason: "r" });

class FakeProvider implements LlmProvider {
  name = "fake";

  constructor(
    private readonly decisionText: string,
    private readonly repairText = decisionText,
    private readonly reflectionText = "{}"
  ) {}

  async available() { return true; }
  async generate() { return this.respond("ok"); }
  async decide() { return this.respond(this.decisionText); }
  async repairDecision() { return this.respond(this.repairText); }
  async reflect() { return this.respond(this.reflectionText); }

  protected respond(text: string): LlmResponse {
    return { provider: this.name, text, usedFallback: false };
  }
}

class SequenceProvider extends FakeProvider {
  constructor(private readonly decisions: string[]) {
    super(decisions[0]);
  }

  async decide() { return this.respond(this.decisions.shift() ?? ""); }
}

function setup(t: TestContext, llm: LlmProvider) {
  const { db, cleanup } = createTestDb();
  t.after(cleanup);

  const store = {
    memory: new MemoryRepository(db),
    goals: new GoalRepository(db),
    experiences: new ExperienceRepository(db),
    skills: new SkillRepository(db),
    stateStore: new AgentStateStore(1000)
  };
  const tools = new ToolRegistry();
  registerInternalTools(tools, store);

  const agent = new AgentService({ llm, ...store, tools, reflection: new ReflectionService() });
  return { agent, tools, ...store };
}

test("ciclo com Mock LLM cria objetivo, executa a tool e registra experiência", async (t) => {
  const { agent, goals, experiences } = setup(t, new MockLlmProvider());

  const first = await agent.runCycle();
  assert.equal(first.executed, true);
  assert.equal(first.provider, "mock");
  assert.equal(first.tool, "create_goal");
  assert.equal(goals.getActive().length, 1);
  assert.equal(experiences.list()[0].action, "create_goal");
  assert.equal(experiences.list()[0].success, true);
  assert.equal(first.state.cycleCount, 1);

  const second = await agent.runCycle();
  assert.equal(second.executed, true);
  assert.equal(second.tool, "get_current_state");
});

test("ciclo com Ollama mockado por HTTP decide, executa e reflete", async (t) => {
  const replies = [
    decision("remember", { type: "knowledge", content: "Ollama respondeu pelo HTTP mockado", importance: 0.7, tags: ["teste"] }),
    JSON.stringify({ learning: "Memórias podem ser gravadas pelo ciclo.", memory_to_create: "", goal_to_create: "" })
  ];
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];

  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = (async (url: string, init: { body: string }) => {
    requests.push({ url: String(url), body: JSON.parse(init.body) });
    return { ok: true, json: async () => ({ response: replies.shift() }) };
  }) as unknown as typeof fetch;

  const { agent, memory } = setup(t, new OllamaProvider({ baseUrl: "http://ollama.test", model: "fake-model" }));
  const result = await agent.runCycle();

  assert.equal(result.executed, true);
  assert.equal(result.provider, "ollama");
  assert.equal(result.tool, "remember");
  assert.ok(memory.list().some((entry) => entry.content === "Ollama respondeu pelo HTTP mockado"));

  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, "http://ollama.test/api/generate");
  assert.equal(requests[0].body.model, "fake-model");
  assert.equal(requests[0].body.format, "json");
  assert.match(String(requests[0].body.system), /remember/);
});

test("decisão válida executa a tool, registra experiência e a reflexão atualiza memória e objetivo", async (t) => {
  const reflection = JSON.stringify({ learning: "aprendi", memory_to_create: "lembrar de validar ações", goal_to_create: "objetivo refletido" });
  const llm = new FakeProvider(decision("create_goal", { title: "Novo objetivo", description: "Criado pelo LLM", priority: 0.8 }), undefined, reflection);
  const { agent, goals, memory, experiences } = setup(t, llm);

  const result = await agent.runCycle();

  assert.equal(result.executed, true);
  assert.equal(result.decision?.thought_summary, "x");

  const titles = goals.getActive().map((goal) => goal.title);
  assert.ok(titles.includes("Novo objetivo"));
  assert.ok(titles.includes("objetivo refletido"));
  assert.ok(memory.list().some((entry) => entry.content === "lembrar de validar ações"));

  const [experience] = experiences.list();
  assert.equal(experience.action, "create_goal");
  assert.equal(experience.success, true);
  assert.equal(experience.learning, "r");
});

test("JSON inválido é corrigido na segunda tentativa e a tool executa", async (t) => {
  const { agent } = setup(t, new FakeProvider("{bad", decision("get_current_state")));

  const result = await agent.runCycle();

  assert.equal(result.executed, true);
  assert.equal(result.tool, "get_current_state");
});

test("JSON inválido após a segunda tentativa registra a falha e não executa tool", async (t) => {
  const { agent, experiences, goals, memory } = setup(t, new FakeProvider("{bad", "{still bad"));

  const result = await agent.runCycle();

  assert.equal(result.executed, false);
  assert.match(String(result.error), /^invalid_decision_json/);
  assert.equal(experiences.list().length, 1);
  assert.equal(experiences.list()[0].action, "decision_validation");
  assert.equal(experiences.list()[0].success, false);
  assert.equal(goals.list().length, 0);
  assert.equal(memory.list().length, 0);
});

test("tool desconhecida bloqueia a execução", async (t) => {
  const { agent, experiences } = setup(t, new FakeProvider(decision("not_exists")));

  const result = await agent.runCycle();

  assert.equal(result.executed, false);
  assert.equal(result.blocked, "tool_not_found");
  assert.equal(experiences.list()[0].success, false);
});

test("tool não autorizada para o LLM não é executada", async (t) => {
  const { agent, tools } = setup(t, new FakeProvider(decision("secret")));
  let called = false;
  tools.register({
    name: "secret",
    description: "Uso interno",
    capability: "state.read",
    allowLlm: false,
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    execute: async () => {
      called = true;
      return {};
    }
  });

  const result = await agent.runCycle();

  assert.equal(result.blocked, "tool_not_permitted");
  assert.equal(called, false);
});

test("argumentos inválidos falham na validação da tool sem gravar nada por ela", async (t) => {
  const { agent, goals, experiences } = setup(t, new FakeProvider(decision("create_goal", { title: "x" })));

  const result = await agent.runCycle();

  assert.equal(result.executed, false);
  assert.equal(experiences.list()[0].success, false);
  assert.ok(!goals.list().some((goal) => goal.title === "x"));
});

test("limites de ações e de ciclos bloqueiam novas execuções", async (t) => {
  const original = { maxToolCallsPerCycle: config.maxToolCallsPerCycle, maxCycles: config.maxCycles };
  t.after(() => Object.assign(config, original));
  const { agent, experiences } = setup(t, new FakeProvider(decision("get_current_state")));

  config.maxToolCallsPerCycle = 0;
  assert.equal((await agent.runCycle()).blocked, "max_tool_calls_per_cycle");
  assert.equal(experiences.list().length, 0);

  config.maxToolCallsPerCycle = original.maxToolCallsPerCycle;
  config.maxCycles = 1;
  assert.equal((await agent.runCycle()).executed, true);
  assert.equal((await agent.runCycle()).blocked, "max_cycles_reached");
  assert.equal(experiences.list().length, 1);
});

test("repetir a mesma ação dentro do cooldown é bloqueado", async (t) => {
  const { agent, memory } = setup(t, new FakeProvider(decision("remember", { type: "episodic", content: "nota repetida" })));

  const first = await agent.runCycle();
  const second = await agent.runCycle();

  assert.equal(first.executed, true);
  assert.equal(second.blocked, "action_cooldown");
  assert.equal(memory.list().filter((entry) => entry.content === "nota repetida").length, 1);
});

test("cooldown também bloqueia a repetição com outra ação no meio", async (t) => {
  const recall = decision("recall", { query: "jardinagem" });
  const { agent } = setup(t, new SequenceProvider([recall, decision("get_current_state"), recall]));

  assert.equal((await agent.runCycle()).executed, true);
  assert.equal((await agent.runCycle()).executed, true);
  assert.equal((await agent.runCycle()).blocked, "action_cooldown");
});
