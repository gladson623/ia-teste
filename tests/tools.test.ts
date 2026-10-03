import test from "node:test";
import assert from "node:assert/strict";
import {
  AgentStateStore,
  ExperienceRepository,
  GoalRepository,
  MemoryRepository,
  SkillRepository
} from "../src/memory/repositories";
import { registerInternalTools } from "../src/tools/internalTools";
import { ToolRegistry } from "../src/tools/registry";
import { createTestDb } from "./helpers";

test("tool registry executes remember and create_goal", async () => {
  const { db, cleanup } = createTestDb();
  const registry = new ToolRegistry();
  registerInternalTools(registry, {
    memory: new MemoryRepository(db),
    goals: new GoalRepository(db),
    experiences: new ExperienceRepository(db),
    skills: new SkillRepository(db),
    stateStore: new AgentStateStore(1000)
  });

  const memoryResult = await registry.execute<any, { id: string }>("remember", {
    type: "episodic",
    content: "Teste remember",
    importance: 0.5,
    tags: ["test"],
    metadata: {},
    source: "test"
  });

  const goalResult = await registry.execute<any, { id: string }>("create_goal", {
    title: "Objetivo de teste",
    description: "Validar create_goal",
    priority: 0.8,
    source: "test"
  });

  assert.ok(memoryResult.id);
  assert.ok(goalResult.id);

  cleanup();
});

test("creation tools return the existing item instead of duplicating", async () => {
  const { db, cleanup } = createTestDb();
  const registry = new ToolRegistry();
  const goals = new GoalRepository(db);
  const memory = new MemoryRepository(db);
  const skills = new SkillRepository(db);
  registerInternalTools(registry, { memory, goals, experiences: new ExperienceRepository(db), skills, stateStore: new AgentStateStore(1000) });

  const repeat = async (tool: string, input: Record<string, unknown>) => {
    const first = await registry.execute<any, { id: string; alreadyExisted?: boolean }>(tool, input);
    const second = await registry.execute<any, { id: string; alreadyExisted?: boolean }>(tool, input);
    assert.equal(second.id, first.id);
    assert.equal(second.alreadyExisted, true);
  };

  await repeat("create_goal", { title: "Aprender jardinagem", description: "Objetivo repetido" });
  await repeat("remember", { type: "knowledge", content: "Fato repetido" });
  await repeat("create_skill", { name: "Pesquisar", description: "Skill repetida" });

  assert.equal(goals.list().length, 1);
  assert.equal(memory.list().length, 1);
  assert.equal(skills.list().length, 1);

  cleanup();
});
