import dotenv from 'dotenv';

dotenv.config();

const intWithDefault = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

export const env = {
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL ?? 'llama3.1',
  maxCycles: intWithDefault(process.env.MAX_CYCLES, 100),
  maxToolCallsPerCycle: intWithDefault(process.env.MAX_TOOL_CALLS_PER_CYCLE, 3),
  minCycleIntervalMs: intWithDefault(process.env.MIN_CYCLE_INTERVAL_MS, 500),
  actionCooldownMs: intWithDefault(process.env.ACTION_COOLDOWN_MS, 2000)
};
