import { z } from "zod";

export const DecisionSchema = z.object({
  thought_summary: z.string().min(1),
  goal: z.string().nullish().transform((value) => value ?? ""),
  action: z.object({
    tool: z.string().min(1),
    arguments: z.record(z.string(), z.unknown()).default({})
  }),
  reason: z.string().min(1)
});

export type AgentDecision = z.infer<typeof DecisionSchema>;

export const ReflectionSchema = z.object({
  learning: z.string().nullish(),
  memory_to_create: z.string().nullish(),
  goal_to_create: z.string().nullish(),
  skill_to_update: z.string().nullish()
});

export type AgentReflection = z.infer<typeof ReflectionSchema>;
