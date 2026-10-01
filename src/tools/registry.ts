import { AgentStore } from '../agent/store.js';

type ToolHandler = (args: Record<string, unknown>) => unknown;

export interface ToolDefinition {
  name: string;
  allowLlm: boolean;
  execute: ToolHandler;
}

export class ToolRegistry {
  private readonly map = new Map<string, ToolDefinition>();

  register(def: ToolDefinition) {
    this.map.set(def.name, def);
  }

  get(name: string) {
    return this.map.get(name);
  }

  list() {
    return [...this.map.values()].map((t) => ({ name: t.name, allowLlm: t.allowLlm }));
  }
}

export const registerDefaultTools = (store: AgentStore) => {
  const registry = new ToolRegistry();

  registry.register({
    name: 'remember',
    allowLlm: true,
    execute: (args) => store.remember(String(args.content ?? ''), Number(args.importance ?? 3), Array.isArray(args.tags) ? args.tags.map(String) : [])
  });

  registry.register({ name: 'recall', allowLlm: true, execute: (args) => store.recall(Number(args.limit ?? 5)) });
  registry.register({ name: 'create_goal', allowLlm: true, execute: (args) => store.createGoal(String(args.title ?? ''), Number(args.priority ?? 3)) });
  registry.register({ name: 'update_goal', allowLlm: true, execute: (args) => store.updateGoal(String(args.id ?? ''), args.patch as object) });
  registry.register({ name: 'complete_goal', allowLlm: true, execute: (args) => store.completeGoal(String(args.id ?? '')) });
  registry.register({
    name: 'record_experience',
    allowLlm: true,
    execute: (args) => store.recordExperience({
      action: String(args.action ?? ''),
      result: String(args.result ?? ''),
      goal: args.goal ? String(args.goal) : undefined,
      observation: args.observation ? String(args.observation) : undefined,
      learning: args.learning ? String(args.learning) : undefined
    })
  });
  registry.register({ name: 'get_current_state', allowLlm: true, execute: () => store.getCurrentState() });
  registry.register({ name: 'create_skill', allowLlm: true, execute: (args) => store.createSkill(String(args.name ?? ''), String(args.description ?? '')) });
  registry.register({ name: 'update_skill', allowLlm: true, execute: (args) => store.updateSkill(String(args.id ?? ''), args.patch as object) });

  return registry;
};
