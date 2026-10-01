import { AgentService } from "./agent/service";
import { createServer } from "./api/server";
import { config } from "./config/env";
import { ResilientLlm } from "./llm";
import { createDatabase } from "./memory/database";
import {
  AgentStateStore,
  ExperienceRepository,
  GoalRepository,
  MemoryRepository,
  SkillRepository
} from "./memory/repositories";
import { defaultPersonality } from "./personality/profile";
import { ReflectionService } from "./reflection/service";
import { registerInternalTools } from "./tools/internalTools";
import { ToolRegistry } from "./tools/registry";

const db = createDatabase(config.databasePath);
const memory = new MemoryRepository(db);
const goals = new GoalRepository(db);
const experiences = new ExperienceRepository(db);
const skills = new SkillRepository(db);
const stateStore = new AgentStateStore(config.agent.intervalMs);
const tools = new ToolRegistry();

registerInternalTools(tools, {
  memory,
  goals,
  experiences,
  skills,
  stateStore
});

const agent = new AgentService({
  llm: new ResilientLlm(),
  memory,
  goals,
  experiences,
  skills,
  stateStore,
  tools,
  reflection: new ReflectionService(),
  personality: defaultPersonality
});

const server = createServer({
  agent,
  memory,
  goals,
  experiences,
  skills
});

server.listen(config.port, () => {
  console.log(`Mordomo AI rodando em http://localhost:${config.port}`);
});
