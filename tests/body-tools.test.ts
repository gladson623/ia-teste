import test from "node:test";
import assert from "node:assert/strict";
import { AgentService } from "../src/agent/service";
import { MockLlmProvider } from "../src/llm/mockProvider";
import { parseWrittenToolCalls } from "../src/llm/ollamaProvider";
import { LlmContext, LlmResponse } from "../src/llm/types";
import {
  AgentStateStore,
  ConversationRepository,
  ExperienceRepository,
  GoalRepository,
  MemoryRepository,
  SkillRepository
} from "../src/memory/repositories";
import { ReflectionService } from "../src/reflection/service";
import { describeBody, registerBodyTools, wantsBodyAction } from "../src/tools/bodyTools";
import { ToolRegistry } from "../src/tools/registry";
import { UnityBridge } from "../src/unity/bridge";
import { createTestDb } from "./helpers";

const objects = [
  { id: "table", displayName: "Mesa", interactive: false },
  { id: "shelf", displayName: "Estante", interactive: false },
  { id: "red_box", displayName: "Caixa vermelha", interactive: true }
];

// Corpo de mentira: aceita tudo, menos pegar o que não é pegável, e guarda os comandos recebidos.
function connectFakeBody(bridge: UnityBridge) {
  const body = {};
  const commands: any[] = [];
  const hello = (holding = "") =>
    bridge.handleMessage(body, JSON.stringify({ type: "unity_hello", payload: { actions: ["move_to", "speak", "pick_up", "drop"], objects, holding } }));

  hello();
  bridge.on("command", (command) => {
    commands.push(command);
    const refused = command.action === "pick_up" && command.target !== "red_box";
    bridge.handleMessage(body, JSON.stringify({
      type: "unity_result",
      payload: { id: command.id, action: command.action, ok: !refused, error: refused ? `not_pickable:${command.target}` : "" }
    }));
  });

  return { body, commands, hello };
}

test("ferramentas do corpo só são oferecidas com o corpo conectado e ficam fora do ciclo autônomo", async () => {
  const bridge = new UnityBridge();
  const registry = new ToolRegistry();
  registerBodyTools(registry, bridge);

  assert.deepEqual(registry.list(), []);
  assert.match(describeBody(bridge), /desconectado/);
  await assert.rejects(registry.execute("move_to", { target: "table" }), /indisponível/);

  connectFakeBody(bridge);
  assert.deepEqual(registry.list().map((tool) => tool.name), ["look_around", "move_to", "pick_up", "drop"]);
  assert.equal(registry.list().every((tool) => tool.allowLlm && tool.chatOnly), true);
});

test("ferramentas do corpo enviam o ID certo, aceitam o nome do objeto e explicam as recusas", async () => {
  const bridge = new UnityBridge();
  const registry = new ToolRegistry();
  registerBodyTools(registry, bridge);
  const { commands, hello } = connectFakeBody(bridge);

  await registry.execute("move_to", { target: "mesa" });
  await registry.execute("pick_up", { target: "caixa" });
  await registry.execute("drop", { location: "shelf" });
  await registry.execute("drop", {});
  assert.deepEqual(
    commands.map(({ id, ...command }) => command),
    [
      { action: "move_to", target: "table" },
      { action: "pick_up", target: "red_box" },
      { action: "drop", location: "shelf" },
      { action: "drop" }
    ]
  );

  await assert.rejects(registry.execute("move_to", { target: "sofá" }), /IDs válidos: table, shelf, red_box/);
  await assert.rejects(registry.execute("pick_up", { target: "table" }), /não pode ser pego/);

  hello("red_box");
  const seen = await registry.execute<object, { holding: string | null; objects: unknown[] }>("look_around", {});
  assert.equal(seen.holding, "red_box");
  assert.equal(seen.objects.length, 3);
  assert.match(describeBody(bridge), /Na mão agora: red_box/);
});

test("chat informa ao modelo a situação do corpo e executa a ação pedida", async () => {
  const contexts: LlmContext[] = [];
  // A primeira resposta só "diz" que fez: o chat cobra a ferramenta uma vez.
  const replies: Array<Partial<LlmResponse>> = [
    { text: "Peguei a caixa." },
    { toolCalls: [{ name: "pick_up", arguments: { target: "red_box" } }] },
    { text: "Estou pegando a caixa vermelha." }
  ];
  class ScriptedLlm extends MockLlmProvider {
    async generate(context: LlmContext): Promise<LlmResponse> {
      contexts.push(context);
      return { provider: "scripted", text: "", usedFallback: false, ...replies.shift() };
    }
  }

  const { db, cleanup } = createTestDb();
  const bridge = new UnityBridge();
  const tools = new ToolRegistry();
  registerBodyTools(tools, bridge);
  const { commands } = connectFakeBody(bridge);

  const agent = new AgentService({
    llm: new ScriptedLlm(),
    memory: new MemoryRepository(db),
    goals: new GoalRepository(db),
    experiences: new ExperienceRepository(db),
    skills: new SkillRepository(db),
    stateStore: new AgentStateStore(1000, db),
    tools,
    reflection: new ReflectionService(),
    conversation: new ConversationRepository(db),
    body: { describe: () => describeBody(bridge), wantsAction: (message) => wantsBodyAction(bridge, message) }
  });

  const result = await agent.chat("pega a caixa vermelha");

  assert.deepEqual(result.toolsUsed, ["pick_up"]);
  assert.equal(result.reply, "Estou pegando a caixa vermelha.");
  assert.deepEqual(commands.map((command) => [command.action, command.target]), [["pick_up", "red_box"]]);
  assert.match(contexts[0].body ?? "", /red_box = Caixa vermelha/);
  assert.ok(contexts[0].tools.some((tool) => tool.name === "pick_up"));
  assert.equal(contexts.length, 3);

  assert.equal(wantsBodyAction(bridge, "Vem até mim"), true);
  assert.equal(wantsBodyAction(bridge, "coloca na estante"), true);
  assert.equal(wantsBodyAction(bridge, "que horas são?"), false);
  assert.equal(wantsBodyAction(new UnityBridge(), "pega a caixa"), false);

  cleanup();
});

test("chamadas de ferramenta escritas no texto pelo modelo são reconhecidas", () => {
  const bridge = new UnityBridge();
  const registry = new ToolRegistry();
  registerBodyTools(registry, bridge);
  connectFakeBody(bridge);
  const tools = registry.list();

  const text = `Vou pegar.
pick_up({"target": "red_box"})
drop(shelf)
move_to(target="user")
look_around()
run_code({"x": 1})
move_to({quebrado})
drop(lugar=shelf)
pick_up {"target": "book"}`;

  assert.deepEqual(parseWrittenToolCalls(text, tools), [
    { name: "pick_up", arguments: { target: "red_box" } },
    { name: "drop", arguments: { location: "shelf" } },
    { name: "move_to", arguments: { target: "user" } },
    { name: "look_around", arguments: {} },
    { name: "pick_up", arguments: { target: "book" } }
  ]);
  assert.deepEqual(parseWrittenToolCalls("pick_up(red_box)", []), []);
});
