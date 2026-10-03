import { AgentStore } from "./store";

export const clip = (text: string, max = 300) => (text.length > max ? `${text.slice(0, max)}…` : text);

// Recorte limitado do que o agente sabe; é tudo o que o LLM recebe do banco.
export function getRelevantContext(store: AgentStore, limit = 5) {
  return {
    state: store.stateStore.get(),
    memories: store.memory.recall(undefined, undefined, limit).map((memory) => ({
      type: memory.type,
      content: clip(memory.content),
      importance: memory.importance,
      tags: memory.tags
    })),
    activeGoals: store.goals.getActive().slice(0, limit).map((goal) => ({
      id: goal.id,
      title: goal.title,
      description: clip(goal.description),
      status: goal.status,
      priority: goal.priority
    })),
    recentExperiences: store.experiences.list(limit).map((experience) => ({
      action: experience.action,
      result: clip(experience.result),
      observation: clip(experience.observation, 600),
      success: experience.success
    })),
    relevantSkills: store.skills.list().slice(0, limit).map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: clip(skill.description),
      successRate: skill.successRate
    }))
  };
}

export type AgentContext = ReturnType<typeof getRelevantContext>;
