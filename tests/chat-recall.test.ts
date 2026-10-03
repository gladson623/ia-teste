import test from "node:test";
import assert from "node:assert/strict";
import { AgentService } from "../src/agent/service";
import { MockLlmProvider } from "../src/llm/mockProvider";
import { LlmContext } from "../src/llm/types";
import {
  AgentStateStore,
  ExperienceRepository,
  GoalRepository,
  MemoryRepository,
  SkillRepository
} from "../src/memory/repositories";
import { ReflectionService } from "../src/reflection/service";
import { ToolRegistry } from "../src/tools/registry";
import { createTestDb } from "./helpers";

class CapturingLlm extends MockLlmProvider {
  lastContext: LlmContext | null = null;

  async generate(context: LlmContext) {
    this.lastContext = context;
    return super.generate(context);
  }
}

test("chat sends the project memory to the LLM when the user asks about the project", async () => {
  const { db, cleanup } = createTestDb();
  const memory = new MemoryRepository(db);
  const llm = new CapturingLlm();
  const agent = new AgentService({
    llm,
    memory,
    goals: new GoalRepository(db),
    experiences: new ExperienceRepository(db),
    skills: new SkillRepository(db),
    stateStore: new AgentStateStore(1000),
    tools: new ToolRegistry(),
    reflection: new ReflectionService()
  });

  const project = "O usuário desenvolverá um projeto de realidade virtual chamado Mordomo AI para o Meta Quest 3.";
  memory.create({ type: "knowledge", content: project, importance: 0.8, tags: [], metadata: {}, source: "test" });
  memory.create({ type: "knowledge", content: "Técnicas de jardinagem exigem rega regular.", importance: 0.9, tags: [], metadata: {}, source: "test" });

  await agent.chat("como se chama meu projeto?");

  assert.deepEqual(llm.lastContext?.memories.map((entry) => entry.content), [project]);

  cleanup();
});
