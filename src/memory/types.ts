export type MemoryType = "episodic" | "knowledge" | "skill" | "experience" | "goal";

export interface MemoryEntry {
  id: string;
  type: MemoryType;
  content: string;
  importance: number;
  tags: string[];
  metadata: Record<string, unknown>;
  source: string;
  createdAt: string;
  lastUsedAt: string;
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed";
  priority: number;
  source: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface Experience {
  id: string;
  action: string;
  goalId: string | null;
  result: string;
  observation: string;
  learning: string;
  success: boolean;
  createdAt: string;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  preconditions: string[];
  steps: string[];
  toolsUsed: string[];
  relatedExperienceIds: string[];
  successRate: number;
  version: string;
  createdAt: string;
  lastUsedAt: string;
}

export interface AgentState {
  mode: "manual" | "automatic";
  running: boolean;
  intervalMs: number;
  currentAction: string;
  lastCycleAt: string | null;
  cycleCount: number;
}
