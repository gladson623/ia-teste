import { z } from "zod";
import { AgentStore } from "../agent/store";
import { ToolRegistry } from "./registry";

// As tools de criação são idempotentes: repetir o mesmo item devolve o existente em vez de duplicar.
const createdSchema = z.object({ id: z.string(), alreadyExisted: z.boolean().optional() });
const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function registerInternalTools(registry: ToolRegistry, deps: AgentStore): void {
  registry.register({
    name: "remember",
    description: "Armazena memória persistente; use type \"knowledge\" para fatos sobre o usuário",
    capability: "memory.write",
    allowLlm: true,
    inputSchema: z.object({
      type: z.enum(["episodic", "knowledge", "skill", "experience", "goal"]).default("knowledge"),
      content: z.string().min(1).describe("Frase completa com o fato a guardar"),
      importance: z.number().min(0).max(1).default(0.5).describe("Número decimal de 0 a 1, por exemplo 0.7"),
      tags: z.array(z.string()).default([]),
      metadata: z.record(z.unknown()).default({}),
      source: z.string().default("tool")
    }),
    outputSchema: createdSchema,
    execute: async (input) => {
      const existing = deps.memory.findByContent(input.content);
      if (existing) return { id: existing.id, alreadyExisted: true };

      return {
        id: deps.memory
          .create({
            ...input,
            type: input.type ?? "knowledge",
            importance: input.importance ?? 0.5,
            tags: input.tags ?? [],
            metadata: input.metadata ?? {},
            source: input.source ?? "tool"
          })
          .id
      };
    }
  });

  registry.register({
    name: "recall",
    description: "Recupera memórias por texto/tags/importância",
    capability: "memory.read",
    allowLlm: true,
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
    allowLlm: true,
    inputSchema: z.object({
      title: z.string().min(3),
      description: z.string().min(3),
      priority: z.number().min(0).max(1).default(0.5),
      source: z.string().default("tool")
    }),
    outputSchema: createdSchema,
    execute: async (input) => {
      const existing = deps.goals.getActive().find((goal) => sameText(goal.title, input.title));
      if (existing) return { id: existing.id, alreadyExisted: true };

      return {
        id: deps.goals
          .create({
            ...input,
            priority: input.priority ?? 0.5,
            source: input.source ?? "tool"
          })
          .id
      };
    }
  });

  registry.register({
    name: "update_goal",
    description: "Atualiza objetivo",
    capability: "goals.write",
    allowLlm: true,
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
    allowLlm: true,
    inputSchema: z.object({ id: z.string() }),
    outputSchema: z.object({ completed: z.boolean() }),
    execute: async ({ id }) => ({ completed: Boolean(deps.goals.complete(id)) })
  });

  registry.register({
    name: "record_experience",
    description: "Registra experiência",
    capability: "experience.write",
    allowLlm: true,
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
    allowLlm: true,
    inputSchema: z.object({}),
    outputSchema: z.object({ state: z.any() }),
    execute: async () => ({ state: deps.stateStore.get() })
  });

  registry.register({
    name: "create_skill",
    description: "Cria habilidade",
    capability: "skills.write",
    allowLlm: true,
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
    outputSchema: createdSchema,
    execute: async (input) => {
      const existing = deps.skills.list().find((skill) => sameText(skill.name, input.name));
      if (existing) return { id: existing.id, alreadyExisted: true };

      return {
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
      };
    }
  });

  registry.register({
    name: "update_skill",
    description: "Atualiza habilidade",
    capability: "skills.write",
    allowLlm: true,
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
