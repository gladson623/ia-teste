import dotenv from "dotenv";

dotenv.config();

export type LlmMode = "auto" | "mock" | "ollama";

const llmMode = (process.env.LLM_MODE ?? "auto") as LlmMode;

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databasePath: process.env.DATABASE_PATH ?? "data/database.sqlite",
  llm: {
    mode: ["auto", "mock", "ollama"].includes(llmMode) ? llmMode : "auto",
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
    ollamaModel: process.env.OLLAMA_MODEL
  },
  agent: {
    intervalMs: Number(process.env.AGENT_INTERVAL_MS ?? 10000)
  }
};
