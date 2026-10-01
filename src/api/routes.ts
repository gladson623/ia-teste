import { Router } from "express";
import { z } from "zod";
import { AgentService } from "../agent/service";
import { ExperienceRepository, GoalRepository, MemoryRepository, SkillRepository } from "../memory/repositories";

interface RouteDeps {
  agent: AgentService;
  memory: MemoryRepository;
  goals: GoalRepository;
  experiences: ExperienceRepository;
  skills: SkillRepository;
}

export function createRouter(deps: RouteDeps) {
  const router = Router();

  router.get("/state", (_req, res) => {
    const state = deps.agent.getState();
    res.json({ ok: true, data: state });
  });

  router.get("/memory", (req, res) => {
    const query = String(req.query.q ?? "").trim() || undefined;
    const tagsParam = String(req.query.tags ?? "").trim();
    const tags = tagsParam ? tagsParam.split(",").map((item) => item.trim()).filter(Boolean) : undefined;
    const limit = Number(req.query.limit ?? 100);
    const data = query || tags ? deps.memory.recall(query, tags, limit) : deps.memory.list(limit);
    res.json({ ok: true, data });
  });

  router.get("/goals", (_req, res) => {
    res.json({ ok: true, data: deps.goals.list() });
  });

  router.get("/experiences", (_req, res) => {
    res.json({ ok: true, data: deps.experiences.list() });
  });

  router.get("/skills", (_req, res) => {
    res.json({ ok: true, data: deps.skills.list() });
  });

  router.post("/chat", async (req, res, next) => {
    try {
      const schema = z.object({ message: z.string().min(1) });
      const { message } = schema.parse(req.body);
      const result = await deps.agent.chat(message);
      res.json({ ok: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  router.post("/cycle", async (req, res, next) => {
    try {
      const schema = z.object({ trigger: z.enum(["manual", "automatic"]).optional() });
      const { trigger } = schema.parse(req.body ?? {});
      const result = await deps.agent.runCycle(trigger ?? "manual");
      res.json({ ok: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  router.post("/agent/start", (req, res, next) => {
    try {
      const schema = z.object({ intervalMs: z.number().int().positive().max(120000).optional() });
      const { intervalMs } = schema.parse(req.body ?? {});
      const state = deps.agent.startAutomatic(intervalMs);
      res.json({ ok: true, data: state });
    } catch (error) {
      next(error);
    }
  });

  router.post("/agent/pause", (_req, res) => {
    const state = deps.agent.pauseAutomatic();
    res.json({ ok: true, data: state });
  });

  router.post("/memory", (req, res, next) => {
    try {
      const schema = z.object({
        type: z.enum(["episodic", "knowledge", "skill", "experience", "goal"]),
        content: z.string().min(1),
        importance: z.number().min(0).max(1).default(0.5),
        tags: z.array(z.string()).default([]),
        metadata: z.record(z.unknown()).default({}),
        source: z.string().default("api")
      });
      const entry = deps.memory.create(schema.parse(req.body));
      res.status(201).json({ ok: true, data: entry });
    } catch (error) {
      next(error);
    }
  });

  router.post("/goals", (req, res, next) => {
    try {
      const schema = z.object({
        title: z.string().min(3),
        description: z.string().min(3),
        priority: z.number().min(0).max(1).default(0.5),
        source: z.string().default("api")
      });
      const goal = deps.goals.create(schema.parse(req.body));
      res.status(201).json({ ok: true, data: goal });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
