import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { AgentState, Experience, Goal, MemoryEntry, MemoryType, Skill } from "./types";

const now = () => new Date().toISOString();

const parseJson = <T>(value: string): T => JSON.parse(value) as T;

export class MemoryRepository {
  constructor(private readonly db: Database.Database) {}

  create(input: Omit<MemoryEntry, "id" | "createdAt" | "lastUsedAt"> & { id?: string }): MemoryEntry {
    const record: MemoryEntry = {
      id: input.id ?? randomUUID(),
      type: input.type,
      content: input.content,
      importance: input.importance,
      tags: input.tags,
      metadata: input.metadata,
      source: input.source,
      createdAt: now(),
      lastUsedAt: now()
    };

    this.db
      .prepare(
        `INSERT INTO memory (id, type, content, importance, tags, metadata, source, created_at, last_used_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.type,
        record.content,
        record.importance,
        JSON.stringify(record.tags),
        JSON.stringify(record.metadata),
        record.source,
        record.createdAt,
        record.lastUsedAt
      );

    return record;
  }

  list(limit = 100): MemoryEntry[] {
    const rows = this.db.prepare(`SELECT * FROM memory ORDER BY importance DESC, created_at DESC LIMIT ?`).all(limit) as any[];
    return rows.map(this.mapRow);
  }

  recall(query?: string, tags?: string[], limit = 20): MemoryEntry[] {
    let sql = `SELECT * FROM memory`;
    const params: unknown[] = [];
    const clauses: string[] = [];

    if (query && query.trim().length > 0) {
      clauses.push("content LIKE ?");
      params.push(`%${query}%`);
    }

    if (tags && tags.length > 0) {
      clauses.push(tags.map(() => "tags LIKE ?").join(" OR "));
      params.push(...tags.map((tag) => `%${tag}%`));
    }

    if (clauses.length > 0) {
      sql += ` WHERE ${clauses.join(" AND ")}`;
    }

    sql += " ORDER BY importance DESC, last_used_at DESC LIMIT ?";
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as any[];
    const timestamp = now();
    for (const row of rows) {
      this.db.prepare("UPDATE memory SET last_used_at = ? WHERE id = ?").run(timestamp, row.id);
      row.last_used_at = timestamp;
    }

    return rows.map(this.mapRow);
  }

  private mapRow(row: any): MemoryEntry {
    return {
      id: row.id,
      type: row.type as MemoryType,
      content: row.content,
      importance: Number(row.importance),
      tags: parseJson<string[]>(row.tags),
      metadata: parseJson<Record<string, unknown>>(row.metadata),
      source: row.source,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at
    };
  }
}

export class GoalRepository {
  constructor(private readonly db: Database.Database) {}

  create(input: Pick<Goal, "title" | "description" | "priority" | "source">): Goal {
    const record: Goal = {
      id: randomUUID(),
      title: input.title,
      description: input.description,
      status: "pending",
      priority: input.priority,
      source: input.source,
      createdAt: now(),
      updatedAt: now(),
      completedAt: null
    };

    this.db
      .prepare(
        `INSERT INTO goals (id, title, description, status, priority, source, created_at, updated_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.title,
        record.description,
        record.status,
        record.priority,
        record.source,
        record.createdAt,
        record.updatedAt,
        record.completedAt
      );

    return record;
  }

  list(): Goal[] {
    const rows = this.db.prepare("SELECT * FROM goals ORDER BY priority DESC, created_at DESC").all() as any[];
    return rows.map(this.mapRow);
  }

  getActive(): Goal[] {
    const rows = this.db
      .prepare("SELECT * FROM goals WHERE status != 'completed' ORDER BY priority DESC, created_at DESC")
      .all() as any[];
    return rows.map(this.mapRow);
  }

  update(id: string, patch: Partial<Pick<Goal, "title" | "description" | "priority" | "status">>): Goal | null {
    const current = this.db.prepare("SELECT * FROM goals WHERE id = ?").get(id) as any;
    if (!current) return null;
    const updated = {
      ...current,
      title: patch.title ?? current.title,
      description: patch.description ?? current.description,
      priority: patch.priority ?? current.priority,
      status: patch.status ?? current.status,
      updated_at: now()
    };
    this.db
      .prepare("UPDATE goals SET title = ?, description = ?, priority = ?, status = ?, updated_at = ? WHERE id = ?")
      .run(updated.title, updated.description, updated.priority, updated.status, updated.updated_at, id);
    return this.mapRow(updated);
  }

  complete(id: string): Goal | null {
    const current = this.db.prepare("SELECT * FROM goals WHERE id = ?").get(id) as any;
    if (!current) return null;
    const completedAt = now();
    this.db
      .prepare("UPDATE goals SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?")
      .run(completedAt, completedAt, id);
    return this.mapRow({ ...current, status: "completed", completed_at: completedAt, updated_at: completedAt });
  }

  private mapRow(row: any): Goal {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: Number(row.priority),
      source: row.source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at
    };
  }
}

export class ExperienceRepository {
  constructor(private readonly db: Database.Database) {}

  create(input: Omit<Experience, "id" | "createdAt">): Experience {
    const record: Experience = {
      id: randomUUID(),
      ...input,
      createdAt: now()
    };

    this.db
      .prepare(
        `INSERT INTO experiences (id, action, goal_id, result, observation, learning, success, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.action,
        record.goalId,
        record.result,
        record.observation,
        record.learning,
        record.success ? 1 : 0,
        record.createdAt
      );

    return record;
  }

  list(limit = 100): Experience[] {
    const rows = this.db.prepare("SELECT * FROM experiences ORDER BY created_at DESC LIMIT ?").all(limit) as any[];
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      goalId: row.goal_id,
      result: row.result,
      observation: row.observation,
      learning: row.learning,
      success: Boolean(row.success),
      createdAt: row.created_at
    }));
  }
}

export class SkillRepository {
  constructor(private readonly db: Database.Database) {}

  create(input: Omit<Skill, "id" | "createdAt" | "lastUsedAt">): Skill {
    const record: Skill = {
      id: randomUUID(),
      ...input,
      createdAt: now(),
      lastUsedAt: now()
    };

    this.db
      .prepare(
        `INSERT INTO skills (id, name, description, preconditions, steps, tools_used, related_experience_ids, success_rate, version, created_at, last_used_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.name,
        record.description,
        JSON.stringify(record.preconditions),
        JSON.stringify(record.steps),
        JSON.stringify(record.toolsUsed),
        JSON.stringify(record.relatedExperienceIds),
        record.successRate,
        record.version,
        record.createdAt,
        record.lastUsedAt
      );

    return record;
  }

  update(id: string, patch: Partial<Omit<Skill, "id" | "createdAt">>): Skill | null {
    const row = this.db.prepare("SELECT * FROM skills WHERE id = ?").get(id) as any;
    if (!row) return null;

    const updated: Skill = {
      id: row.id,
      name: patch.name ?? row.name,
      description: patch.description ?? row.description,
      preconditions: patch.preconditions ?? parseJson<string[]>(row.preconditions),
      steps: patch.steps ?? parseJson<string[]>(row.steps),
      toolsUsed: patch.toolsUsed ?? parseJson<string[]>(row.tools_used),
      relatedExperienceIds: patch.relatedExperienceIds ?? parseJson<string[]>(row.related_experience_ids),
      successRate: patch.successRate ?? Number(row.success_rate),
      version: patch.version ?? row.version,
      createdAt: row.created_at,
      lastUsedAt: now()
    };

    this.db
      .prepare(
        `UPDATE skills
         SET name = ?, description = ?, preconditions = ?, steps = ?, tools_used = ?, related_experience_ids = ?, success_rate = ?, version = ?, last_used_at = ?
         WHERE id = ?`
      )
      .run(
        updated.name,
        updated.description,
        JSON.stringify(updated.preconditions),
        JSON.stringify(updated.steps),
        JSON.stringify(updated.toolsUsed),
        JSON.stringify(updated.relatedExperienceIds),
        updated.successRate,
        updated.version,
        updated.lastUsedAt,
        id
      );

    return updated;
  }

  list(): Skill[] {
    const rows = this.db.prepare("SELECT * FROM skills ORDER BY created_at DESC").all() as any[];
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      preconditions: parseJson<string[]>(row.preconditions),
      steps: parseJson<string[]>(row.steps),
      toolsUsed: parseJson<string[]>(row.tools_used),
      relatedExperienceIds: parseJson<string[]>(row.related_experience_ids),
      successRate: Number(row.success_rate),
      version: row.version,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at
    }));
  }
}

export class AgentStateStore {
  private state: AgentState;

  constructor(initialIntervalMs: number) {
    this.state = {
      mode: "manual",
      running: false,
      intervalMs: initialIntervalMs,
      currentAction: "idle",
      lastCycleAt: null,
      cycleCount: 0
    };
  }

  get(): AgentState {
    return { ...this.state };
  }

  update(patch: Partial<AgentState>): AgentState {
    this.state = { ...this.state, ...patch };
    return this.get();
  }
}
