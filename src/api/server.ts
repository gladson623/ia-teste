import express from "express";
import http from "node:http";
import path from "node:path";
import { WebSocketServer } from "ws";
import { AgentService } from "../agent/service";
import { config } from "../config/env";
import { ExperienceRepository, GoalRepository, MemoryRepository, SkillRepository } from "../memory/repositories";
import { createRouter } from "./routes";

interface ServerDeps {
  agent: AgentService;
  memory: MemoryRepository;
  goals: GoalRepository;
  experiences: ExperienceRepository;
  skills: SkillRepository;
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
    res.status(400).json({ ok: false, error: error.message });
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

  wss.on("connection", (socket) => {
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
