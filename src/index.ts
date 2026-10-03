import { AgentService } from "./agent/service";
import { createServer } from "./api/server";
import { config } from "./config/env";
import { ResilientLlm } from "./llm";
import { OllamaProvider } from "./llm/ollamaProvider";
import { createDatabase } from "./memory/database";
import {
  AgentStateStore,
  ConversationRepository,
  ExperienceRepository,
  GoalRepository,
  MemoryRepository,
  ReminderRepository,
  SkillRepository
} from "./memory/repositories";
import { defaultPersonality } from "./personality/profile";
import { ReflectionService } from "./reflection/service";
import { describeBody, registerBodyTools, wantsBodyAction } from "./tools/bodyTools";
import { registerButlerTools } from "./tools/butlerTools";
import { registerInternalTools } from "./tools/internalTools";
import { ToolRegistry } from "./tools/registry";
import { UnityBridge } from "./unity/bridge";
import { KokoroTts } from "./voice/kokoro";
import { startKokoroService } from "./voice/kokoroService";

const db = createDatabase(config.databasePath);
const memory = new MemoryRepository(db);
const goals = new GoalRepository(db);
const experiences = new ExperienceRepository(db);
const skills = new SkillRepository(db);
const conversation = new ConversationRepository(db);
const reminders = new ReminderRepository(db);
const stateStore = new AgentStateStore(config.agent.intervalMs, db);
const tools = new ToolRegistry();

registerInternalTools(tools, {
  memory,
  goals,
  experiences,
  skills,
  stateStore
});

registerButlerTools(tools, { reminders });

const unity = new UnityBridge();
registerBodyTools(tools, unity);

const llm = new ResilientLlm();

const agent = new AgentService({
  llm,
  memory,
  goals,
  experiences,
  skills,
  stateStore,
  tools,
  reflection: new ReflectionService(),
  personality: defaultPersonality,
  conversation,
  reminders,
  body: { describe: () => describeBody(unity), wantsAction: (message) => wantsBodyAction(unity, message) }
});
agent.startReminders();

const tts = new KokoroTts({ baseUrl: config.tts.kokoroBaseUrl, voice: config.tts.voice, timeoutMs: config.tts.timeoutMs });

const server = createServer({
  agent,
  memory,
  goals,
  experiences,
  skills,
  conversation,
  reminders,
  unity,
  tts
});

server.listen(config.port, () => {
  console.log(`Mordomo AI rodando em http://localhost:${config.port}`);
  console.log(`LLM: modo ${config.llm.mode}, modelo ${config.llm.ollamaModel} em ${config.llm.ollamaBaseUrl}`);

  if (config.tts.autostart) {
    void startKokoroService(tts, config.tts.kokoroBaseUrl);
  }

  if (config.llm.mode !== "mock") {
    void new OllamaProvider({ baseUrl: config.llm.ollamaBaseUrl, model: config.llm.ollamaModel }).available().then((ok) => {
      if (!ok) {
        console.warn(`Aviso: Ollama indisponível ou modelo "${config.llm.ollamaModel}" não instalado (ollama pull ${config.llm.ollamaModel}).`);
      }
    });
  }
});
