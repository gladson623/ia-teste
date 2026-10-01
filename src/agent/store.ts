import { AgentState, Experience, Goal, Memory, Skill } from '../types/domain.js';

const now = () => new Date().toISOString();
const id = () => Math.random().toString(36).slice(2, 10);

export class AgentStore {
  memories: Memory[] = [];
  goals: Goal[] = [];
  experiences: Experience[] = [];
  skills: Skill[] = [];
  state: AgentState = { mode: 'manual', cycleCount: 0, running: false };

  getCurrentState() {
    return {
      ...this.state,
      activeGoals: this.goals.filter((g) => !g.completed).length,
      memories: this.memories.length,
      skills: this.skills.length,
      recentExperience: this.experiences.at(-1)
    };
  }

  remember(content: string, importance = 3, tags: string[] = []) {
    const memory: Memory = { id: id(), content, importance, tags, createdAt: now() };
    this.memories.push(memory);
    return memory;
  }

  recall(limit = 5) {
    return [...this.memories].sort((a, b) => b.importance - a.importance).slice(0, limit);
  }

  createGoal(title: string, priority = 3) {
    const goal: Goal = { id: id(), title, priority, completed: false, createdAt: now() };
    this.goals.push(goal);
    return goal;
  }

  updateGoal(id: string, patch: Partial<Goal>) {
    const goal = this.goals.find((g) => g.id === id);
    if (!goal) return null;
    Object.assign(goal, patch);
    return goal;
  }

  completeGoal(id: string) {
    return this.updateGoal(id, { completed: true });
  }

  recordExperience(exp: Omit<Experience, 'id' | 'createdAt'>) {
    const value: Experience = { id: id(), createdAt: now(), ...exp };
    this.experiences.push(value);
    return value;
  }

  createSkill(name: string, description = '') {
    const skill: Skill = { id: id(), name, description, successRate: 0, updatedAt: now() };
    this.skills.push(skill);
    return skill;
  }

  updateSkill(id: string, patch: Partial<Skill>) {
    const skill = this.skills.find((s) => s.id === id || s.name === id);
    if (!skill) return null;
    Object.assign(skill, patch, { updatedAt: now() });
    return skill;
  }
}
