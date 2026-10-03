import { z } from 'zod';

export const DecisionSchema = z.object({
  thought_summary: z.string().min(1),
  goal: z.string().min(1).optional().default(''),
  action: z.object({
    tool: z.string().min(1),
    arguments: z.record(z.string(), z.unknown()).default({})
  }),
  reason: z.string().min(1)
});

export type AgentDecision = z.infer<typeof DecisionSchema>;

export const ReflectionSchema = z.object({
  learning: z.string().optional(),
  memory_to_create: z.string().optional(),
  goal_to_create: z.string().optional(),
  skill_to_update: z.string().optional()
});

export type AgentReflection = z.infer<typeof ReflectionSchema>;
