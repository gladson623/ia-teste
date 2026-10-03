import test from "node:test";
import assert from "node:assert/strict";
import { UnityCommandSchema } from "../src/unity/actions";
import { UnityBridge } from "../src/unity/bridge";

test("contrato do corpo só aceita ações conhecidas, sem campos extras", () => {
  assert.equal(UnityCommandSchema.safeParse({ action: "move_to", target: "table" }).success, true);
  assert.equal(UnityCommandSchema.safeParse({ action: "speak", text: "Olá! Eu sou o Mordomo." }).success, true);
  assert.equal(UnityCommandSchema.safeParse({ action: "pick_up", target: "red_box" }).success, true);
  assert.equal(UnityCommandSchema.safeParse({ action: "drop", location: "shelf" }).success, true);
  assert.equal(UnityCommandSchema.safeParse({ action: "drop" }).success, true);

  assert.equal(UnityCommandSchema.safeParse({ action: "run_code", code: "x" }).success, false);
  assert.equal(UnityCommandSchema.safeParse({ action: "move_to" }).success, false);
  assert.equal(UnityCommandSchema.safeParse({ action: "move_to", target: "table", position: [0, 0, 0] }).success, false);
});

test("ponte entrega o comando ao corpo conectado e devolve o resultado dele", async () => {
  const bridge = new UnityBridge();
  const body = {};

  bridge.handleMessage(body, JSON.stringify({
    type: "unity_hello",
    payload: { actions: ["move_to", "speak"], objects: [{ id: "table", displayName: "Mesa", interactive: false }] }
  }));
  assert.equal(bridge.getState().connected, true);
  assert.deepEqual(bridge.getState().world?.objects.map((item) => item.id), ["table"]);

  bridge.on("command", (command) => {
    assert.deepEqual({ action: command.action, target: command.target }, { action: "move_to", target: "table" });
    bridge.handleMessage(body, JSON.stringify({ type: "unity_result", payload: { id: command.id, action: command.action, ok: true, error: "" } }));
  });

  const { result } = await bridge.send({ action: "move_to", target: "table" });
  assert.equal(result?.ok, true);

  bridge.handleDisconnect(body);
  assert.equal(bridge.getState().connected, false);
});

test("ponte devolve null quando não há corpo e ignora resultados de quem não se apresentou", async () => {
  const bridge = new UnityBridge();
  bridge.on("command", (command) => {
    bridge.handleMessage({}, JSON.stringify({ type: "unity_result", payload: { id: command.id, action: command.action, ok: true } }));
  });

  const { result } = await bridge.send({ action: "speak", text: "oi" });
  assert.equal(result, null);
});

test("speak envia a fala limpa ao corpo conectado e não faz nada sem corpo", () => {
  const bridge = new UnityBridge();
  const commands: any[] = [];
  bridge.on("command", (command) => commands.push(command));

  bridge.speak("Olá, **senhor**!");
  assert.equal(commands.length, 0);

  bridge.handleMessage({}, JSON.stringify({ type: "unity_hello", payload: {} }));
  bridge.speak("Olá, **senhor**! 😀");
  assert.deepEqual(commands.map((command) => [command.action, command.text]), [["speak", "Olá, senhor!"]]);
});
