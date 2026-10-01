import { z } from "zod";
import { GoalRepository, MemoryRepository, ExperienceRepository, SkillRepository, AgentStateStore } from "../memory/repositories";
import { ToolRegistry } from "./registry";

interface ToolDeps {
  memory: MemoryRepository;
  goals: GoalRepository;
  experiences: ExperienceRepository;
  skills: SkillRepository;
  stateStore: AgentStateStore;
}

export function registerInternalTools(registry: ToolRegistry, deps: ToolDeps): void {
  registry.register({
    name: "remember",
    description: "Armazena memória persistente",
    capability: "memory.write",
    inputSchema: z.object({
      type: z.enum(["episodic", "knowledge", "skill", "experience", "goal"]),
      content: z.string().min(1),
      importance: z.number().min(0).max(1).default(0.5),
      tags: z.array(z.string()).default([]),
      metadata: z.record(z.unknown()).default({}),
      source: z.string().default("tool")
    }),
    outputSchema: z.object({ id: z.string() }),
    execute: async (input) => ({
      id: deps.memory
        .create({
          ...input,
          importance: input.importance ?? 0.5,
          tags: input.tags ?? [],
          metadata: input.metadata ?? {},
          source: input.source ?? "tool"
        })
        .id
    })
  });

  registry.register({
    name: "recall",
    description: "Recupera memórias por texto/tags/importância",
    capability: "memory.read",
    inputSchema: z.object({
      query: z.string().optional(),
      tags: z.array(z.string()).optional(),
      limit: z.number().int().positive().max(100).optional()
    }),
    outputSchema: z.object({ memories: z.array(z.any()) }),
    execute: async ({ query, tags, limit }) => ({
      memories: deps.memory.recall(query, tags, limit ?? 20)
    })
  });

  registry.register({
    name: "create_goal",
    description: "Cria objetivo",
    capability: "goals.write",
    inputSchema: z.object({
      title: z.string().min(3),
      description: z.string().min(3),
      priority: z.number().min(0).max(1).default(0.5),
      source: z.string().default("tool")
    }),
    outputSchema: z.object({ id: z.string() }),
    execute: async (input) => ({
      id: deps.goals
        .create({
          ...input,
          priority: input.priority ?? 0.5,
          source: input.source ?? "tool"
        })
        .id
    })
  });

  registry.register({
    name: "update_goal",
    description: "Atualiza objetivo",
    capability: "goals.write",
    inputSchema: z.object({
      id: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      priority: z.number().min(0).max(1).optional(),
      status: z.enum(["pending", "in_progress", "completed"]).optional()
    }),
    outputSchema: z.object({ updated: z.boolean() }),
    execute: async ({ id, ...patch }) => ({ updated: Boolean(deps.goals.update(id, patch)) })
  });

  registry.register({
    name: "complete_goal",
    description: "Conclui objetivo",
    capability: "goals.write",
    inputSchema: z.object({ id: z.string() }),
    outputSchema: z.object({ completed: z.boolean() }),
    execute: async ({ id }) => ({ completed: Boolean(deps.goals.complete(id)) })
  });

  registry.register({
    name: "record_experience",
    description: "Registra experiência",
    capability: "experience.write",
    inputSchema: z.object({
      action: z.string(),
      goalId: z.string().nullable().optional(),
      result: z.string(),
      observation: z.string(),
      learning: z.string(),
      success: z.boolean()
    }),
    outputSchema: z.object({ id: z.string() }),
    execute: async (input) => ({
      id: deps.experiences
        .create({
          action: input.action,
          goalId: input.goalId ?? null,
          result: input.result,
          observation: input.observation,
          learning: input.learning,
          success: input.success
        })
        .id
    })
  });

  registry.register({
    name: "get_current_state",
    description: "Obtém estado do agente",
    capability: "state.read",
    inputSchema: z.object({}),
    outputSchema: z.object({ state: z.any() }),
    execute: async () => ({ state: deps.stateStore.get() })
  });

  registry.register({
    name: "create_skill",
    description: "Cria habilidade",
    capability: "skills.write",
    inputSchema: z.object({
      name: z.string().min(2),
      description: z.string().min(3),
      preconditions: z.array(z.string()).default([]),
      steps: z.array(z.string()).default([]),
      toolsUsed: z.array(z.string()).default([]),
      relatedExperienceIds: z.array(z.string()).default([]),
      successRate: z.number().min(0).max(1).default(0),
      version: z.string().default("1.0.0")
    }),
    outputSchema: z.object({ id: z.string() }),
    execute: async (input) => ({
      id: deps.skills
        .create({
          ...input,
          preconditions: input.preconditions ?? [],
          steps: input.steps ?? [],
          toolsUsed: input.toolsUsed ?? [],
          relatedExperienceIds: input.relatedExperienceIds ?? [],
          successRate: input.successRate ?? 0,
          version: input.version ?? "1.0.0"
        })
        .id
    })
  });

  registry.register({
    name: "update_skill",
    description: "Atualiza habilidade",
    capability: "skills.write",
    inputSchema: z.object({
      id: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      preconditions: z.array(z.string()).optional(),
      steps: z.array(z.string()).optional(),
      toolsUsed: z.array(z.string()).optional(),
      relatedExperienceIds: z.array(z.string()).optional(),
      successRate: z.number().min(0).max(1).optional(),
      version: z.string().optional()
    }),
    outputSchema: z.object({ updated: z.boolean() }),
    execute: async ({ id, ...patch }) => ({ updated: Boolean(deps.skills.update(id, patch)) })
  });
}
