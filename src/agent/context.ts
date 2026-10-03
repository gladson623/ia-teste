import { AgentStore } from './store.js';

export function getRelevantContext(store: AgentStore) {
  return {
    state: store.getCurrentState(),
    memories: store.recall(5),
    activeGoals: store.goals.filter((g) => !g.completed).slice(0, 5),
    recentExperiences: store.experiences.slice(-5),
    relevantSkills: store.skills.slice(-5)
  };
}
