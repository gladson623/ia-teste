import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentStore } from '../src/agent/store.js';
import { AgentLoop } from '../src/agent/loop.js';
import { ToolRegistry, registerDefaultTools } from '../src/tools/registry.js';
import { LlmClient } from '../src/llm/client.js';
import { LlmProvider } from '../src/llm/provider.js';
import { MockLlmProvider } from '../src/llm/mockProvider.js';
import { createServer } from '../src/api/server.js';
import { AgentController } from '../src/agent/controller.js';
import { OllamaLlmProvider } from '../src/llm/ollamaProvider.js';

class FakeProvider implements LlmProvider {
  name = 'fake';
  constructor(private decision: string, private reflection = '{}', private throws = false) {}
  async decide() { if (this.throws) throw new Error('down'); return this.decision; }
  async repairDecision() { return this.decision; }
  async reflect() { return this.reflection; }
}

test('fallback to mock when primary unavailable', async () => {
  const store = new AgentStore();
  const client = new LlmClient(new FakeProvider('', '{}', true), new MockLlmProvider());
  const result = await client.decide({});
  assert.equal(result.provider, 'mock');
  assert.ok(result.decision);
});

test('invalid json then repair remains invalid does not execute tool', async () => {
  class InvalidProvider implements LlmProvider {
    name = 'invalid';
    async decide() { return '{bad'; }
    async repairDecision() { return '{still bad'; }
    async reflect() { return '{}'; }
  }
  const store = new AgentStore();
  const tools = registerDefaultTools(store);
  const loop = new AgentLoop(store, new LlmClient(new InvalidProvider(), new MockLlmProvider()), tools);
  const result = await loop.runCycle();
  assert.equal(result.executed, false);
  assert.equal(store.experiences.at(-1)?.action, 'decision_validation');
});

test('invalid json then second attempt valid executes tool', async () => {
  class RepairProvider implements LlmProvider {
    name = 'repair-provider';
    async decide() { return '{bad'; }
    async repairDecision() {
      return JSON.stringify({ thought_summary: 'ok', goal: 'g', action: { tool: 'get_current_state', arguments: {} }, reason: 'fixed' });
    }
    async reflect() { return '{}'; }
  }
  const store = new AgentStore();
  const loop = new AgentLoop(store, new LlmClient(new RepairProvider(), new MockLlmProvider()), registerDefaultTools(store));
  const result = await loop.runCycle();
  assert.equal(result.executed, true);
  assert.equal(result.tool, 'get_current_state');
});

test('tool inexistente bloqueia execução', async () => {
  const decision = JSON.stringify({ thought_summary: 'x', goal: 'y', action: { tool: 'not_exists', arguments: {} }, reason: 'r' });
  const loop = new AgentLoop(new AgentStore(), new LlmClient(new FakeProvider(decision), new MockLlmProvider()), registerDefaultTools(new AgentStore()));
  const result = await loop.runCycle();
  assert.equal(result.blocked, 'tool_not_found');
});

test('tool sem permissão bloqueia execução', async () => {
  const store = new AgentStore();
  const tools = new ToolRegistry();
  tools.register({ name: 'get_current_state', allowLlm: false, execute: () => ({}) });
  const decision = JSON.stringify({ thought_summary: 'x', goal: 'y', action: { tool: 'get_current_state', arguments: {} }, reason: 'r' });
  const loop = new AgentLoop(store, new LlmClient(new FakeProvider(decision), new MockLlmProvider()), tools);
  const result = await loop.runCycle();
  assert.equal(result.blocked, 'tool_not_permitted');
});

test('decisão válida cria experiência e reflexão pode criar memória/objetivo', async () => {
  const store = new AgentStore();
  const decision = JSON.stringify({ thought_summary: 'x', goal: 'y', action: { tool: 'create_goal', arguments: { title: 'Novo objetivo', priority: 4 } }, reason: 'r' });
  const reflection = JSON.stringify({ memory_to_create: 'lembrar de validar ações', goal_to_create: 'objetivo refletido' });
  const loop = new AgentLoop(store, new LlmClient(new FakeProvider(decision, reflection), new MockLlmProvider()), registerDefaultTools(store));
  const result = await loop.runCycle();
  assert.equal(result.executed, true);
  assert.ok(store.experiences.length >= 1);
  assert.ok(store.memories.some((m) => m.content.includes('validar')));
  assert.ok(store.goals.some((g) => g.title === 'objetivo refletido'));
});

test('repetição de ação ativa cooldown', async () => {
  const store = new AgentStore();
  const decision = JSON.stringify({ thought_summary: 'x', goal: 'y', action: { tool: 'get_current_state', arguments: {} }, reason: 'r' });
  const loop = new AgentLoop(store, new LlmClient(new FakeProvider(decision), new MockLlmProvider()), registerDefaultTools(store));
  await loop.runCycle();
  const second = await loop.runCycle();
  assert.equal(second.blocked, 'action_cooldown');
});

test('max cycles limite bloqueia novas execuções', async () => {
  const store = new AgentStore();
  store.state.cycleCount = 101;
  const decision = JSON.stringify({ thought_summary: 'x', goal: 'y', action: { tool: 'get_current_state', arguments: {} }, reason: 'r' });
  const loop = new AgentLoop(store, new LlmClient(new FakeProvider(decision), new MockLlmProvider()), registerDefaultTools(store));
  (loop as any).cyclesSinceStart = 100;
  const result = await loop.runCycle();
  assert.equal(result.blocked, 'max_cycles_reached');
});

test('ollama provider works with mock http', async () => {
  const originalFetch = global.fetch;
  global.fetch = (async () => ({ ok: true, json: async () => ({ response: JSON.stringify({ thought_summary: 'x', goal: 'y', action: { tool: 'get_current_state', arguments: {} }, reason: 'r' }) }) } as any)) as any;
  const provider = new OllamaLlmProvider();
  const response = await provider.decide({ state: {} });
  assert.ok(response.includes('thought_summary'));
  global.fetch = originalFetch;
});

test('api endpoints state and cycle', async () => {
  const store = new AgentStore();
  const decision = JSON.stringify({ thought_summary: 'x', goal: 'y', action: { tool: 'get_current_state', arguments: {} }, reason: 'r' });
  const controller = new AgentController(new AgentLoop(store, new LlmClient(new FakeProvider(decision), new MockLlmProvider()), registerDefaultTools(store)), store);
  const server = createServer(controller, store);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const stateResponse = await fetch(`http://127.0.0.1:${addr.port}/state`);
  assert.equal(stateResponse.status, 200);
  const cycleResponse = await fetch(`http://127.0.0.1:${addr.port}/cycle`, { method: 'POST' });
  assert.equal(cycleResponse.status, 200);
  const chatResponse = await fetch(`http://127.0.0.1:${addr.port}/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'oi' }) });
  assert.equal(chatResponse.status, 200);
  const goalsResponse = await fetch(`http://127.0.0.1:${addr.port}/goals`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'meta via api', priority: 4 }) });
  assert.equal(goalsResponse.status, 201);
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
});
