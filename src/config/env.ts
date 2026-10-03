import dotenv from "dotenv";

dotenv.config();

export type LlmMode = "auto" | "mock" | "ollama";

const llmMode = (process.env.LLM_MODE ?? "auto") as LlmMode;
const intWithDefault = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databasePath: process.env.DATABASE_PATH ?? "data/database.sqlite",
  llm: {
    mode: ["auto", "mock", "ollama"].includes(llmMode) ? llmMode : "auto",
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
    ollamaModel: process.env.OLLAMA_MODEL ?? "llama3.1",
    ollamaTimeoutMs: intWithDefault(process.env.OLLAMA_TIMEOUT_MS, 120000)
  },
  agent: {
    intervalMs: Number(process.env.AGENT_INTERVAL_MS ?? 10000)
  },
  maxCycles: intWithDefault(process.env.MAX_CYCLES, 100),
  maxToolCallsPerCycle: intWithDefault(process.env.MAX_TOOL_CALLS_PER_CYCLE, 3),
  minCycleIntervalMs: intWithDefault(process.env.MIN_CYCLE_INTERVAL_MS, 500),
  actionCooldownMs: intWithDefault(process.env.ACTION_COOLDOWN_MS, 2000),
  chat: {
    historyLimit: intWithDefault(process.env.CHAT_HISTORY_LIMIT, 20),
    maxToolCalls: intWithDefault(process.env.MAX_CHAT_TOOL_CALLS, 5)
  },
  reminderCheckMs: intWithDefault(process.env.REMINDER_CHECK_MS, 15000),
  tts: {
    kokoroBaseUrl: process.env.KOKORO_BASE_URL ?? "http://127.0.0.1:8880",
    voice: process.env.KOKORO_VOICE ?? "pf_dora,af_bella",
    autostart: process.env.KOKORO_AUTOSTART !== "false",
    timeoutMs: intWithDefault(process.env.KOKORO_TIMEOUT_MS, 60000)
  }
};

export const env = config;
