import test from "node:test";
import assert from "node:assert/strict";
import { AgentService } from "../src/agent/service";
import { MockLlmProvider } from "../src/llm/mockProvider";
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
import { createTestDb } from "./helpers";

test("manual cycle records experience and updates state", async () => {
  const { db, cleanup } = createTestDb();
  const memory = new MemoryRepository(db);
  const goals = new GoalRepository(db);
  const experiences = new ExperienceRepository(db);
  const skills = new SkillRepository(db);
  const stateStore = new AgentStateStore(1000);
  const tools = new ToolRegistry();

  registerInternalTools(tools, { memory, goals, experiences, skills, stateStore });

  const agent = new AgentService({
    llm: new MockLlmProvider(),
    memory,
    goals,
    experiences,
    skills,
    stateStore,
    tools,
    reflection: new ReflectionService()
  });

  const result = await agent.runCycle("manual");
  assert.equal(result.trigger, "manual");
  assert.equal(experiences.list(10).length, 1);
  assert.equal(agent.getState().cycleCount, 1);

  cleanup();
});
