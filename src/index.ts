import { createServer } from './api/server.js';
import { AgentController } from './agent/controller.js';
import { AgentLoop } from './agent/loop.js';
import { AgentStore } from './agent/store.js';
import { LlmClient } from './llm/client.js';
import { MockLlmProvider } from './llm/mockProvider.js';
import { OllamaLlmProvider } from './llm/ollamaProvider.js';
import { registerDefaultTools } from './tools/registry.js';

const store = new AgentStore();
const llm = new LlmClient(new OllamaLlmProvider(), new MockLlmProvider());
const tools = registerDefaultTools(store);
const loop = new AgentLoop(store, llm, tools);
const controller = new AgentController(loop, store);

const server = createServer(controller, store);
const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`Mordomo AI listening on ${port}`);
});
