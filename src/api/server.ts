import express from "express";
import http from "node:http";
import path from "node:path";
import { WebSocketServer } from "ws";
import { ZodError } from "zod";
import { AgentService } from "../agent/service";
import { config } from "../config/env";
import {
  ConversationRepository,
  ExperienceRepository,
  GoalRepository,
  MemoryRepository,
  ReminderRepository,
  SkillRepository
} from "../memory/repositories";
import { UnityBridge } from "../unity/bridge";
import { KokoroTts } from "../voice/kokoro";
import { createRouter } from "./routes";

interface ServerDeps {
  agent: AgentService;
  memory: MemoryRepository;
  goals: GoalRepository;
  experiences: ExperienceRepository;
  skills: SkillRepository;
  conversation: ConversationRepository;
  reminders: ReminderRepository;
  unity: UnityBridge;
  tts: KokoroTts;
}

export function createServer(deps: ServerDeps) {
  const app = express();
  app.use(express.json({ limit: "512kb" }));

  app.use("/api", createRouter(deps));

  const webPath = path.join(process.cwd(), "web");
  app.use(express.static(webPath));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, mode: deps.agent.getState().mode, llmMode: config.llm.mode });
  });

  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // Entrada inválida é erro do cliente; o resto (Ollama fora do ar, banco) é erro do servidor.
    const badInput = error instanceof ZodError || error instanceof SyntaxError;
    res.status(badInput ? 400 : 500).json({ ok: false, error: error.message });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });

  const broadcast = (event: unknown) => {
    const payload = JSON.stringify(event);
    wss.clients.forEach((client) => {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    });
  };

  deps.agent.on("event", broadcast);

  // Corpo (Unity): os comandos saem pelo mesmo WebSocket e o que o Unity responde aparece nos logs do painel.
  const unityEvent = (type: string) => (payload?: unknown) =>
    broadcast({ type, timestamp: new Date().toISOString(), payload: payload ?? {} });
  deps.unity.on("command", unityEvent("unity_command"));
  deps.unity.on("hello", unityEvent("unity_connected"));
  deps.unity.on("result", unityEvent("unity_result_received"));
  deps.unity.on("bye", unityEvent("unity_disconnected"));

  // O que o Mordomo diz no chat e os lembretes também saem pela boca do corpo, quando há um conectado.
  deps.agent.on("event", (event: { type?: string; payload?: { response?: string; text?: string } }) => {
    if (event.type === "chat" && event.payload?.response) deps.unity.speak(event.payload.response);
    if (event.type === "reminder" && event.payload?.text) deps.unity.speak(`Lembrete: ${event.payload.text}`);
  });

  wss.on("connection", (socket) => {
    socket.on("message", (data) => deps.unity.handleMessage(socket, data.toString()));
    socket.on("close", () => deps.unity.handleDisconnect(socket));

    socket.send(
      JSON.stringify({
        type: "log",
        timestamp: new Date().toISOString(),
        payload: { message: "Conexão WebSocket estabelecida." }
      })
    );
  });

  return server;
}
