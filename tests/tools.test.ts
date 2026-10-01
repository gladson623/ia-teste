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
