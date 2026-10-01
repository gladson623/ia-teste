export type AgentMode = 'manual' | 'automatic';

export interface Memory {
  id: string;
  content: string;
  importance: number;
  tags: string[];
  createdAt: string;
}

export interface Goal {
  id: string;
  title: string;
  priority: number;
  completed: boolean;
  createdAt: string;
}

export interface Experience {
  id: string;
  action: string;
  goal?: string;
  result: string;
  observation?: string;
  learning?: string;
  createdAt: string;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  successRate: number;
  updatedAt: string;
}

export interface AgentState {
  mode: AgentMode;
  cycleCount: number;
  running: boolean;
  lastActionSignature?: string;
  lastActionAt?: number;
}
