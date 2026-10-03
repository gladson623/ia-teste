import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { AgentState, ConversationMessage, Experience, Goal, MemoryEntry, MemoryType, Reminder, Skill } from "./types";

const now = () => new Date().toISOString();

const parseJson = <T>(value: string): T => JSON.parse(value) as T;

const normalizeText = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Palavras sem valor de busca (já normalizadas); termos com menos de 3 letras também são ignorados.
const STOPWORDS = new Set([
  "que", "qual", "quais", "como", "quando", "onde", "quem", "por", "porque", "para", "pra", "com", "sem", "sobre",
  "uma", "uns", "umas", "dos", "das", "nos", "nas", "aos", "pelo", "pela", "num", "numa", "mas", "nem", "ate",
  "meu", "minha", "meus", "minhas", "seu", "sua", "seus", "suas", "teu", "tua", "nosso", "nossa",
  "esse", "essa", "isso", "este", "esta", "isto", "aquele", "aquela", "aquilo", "ele", "ela", "eles", "elas",
  "voce", "voces", "mais", "menos", "muito", "tambem", "sim", "nao", "foi", "sao", "ser", "era", "estar", "estao",
  "tem", "ter", "tinha", "vai", "vou", "the", "and", "for", "what", "how"
]);

// Termos de busca de uma consulta em linguagem natural; sem palavras-chave, vale a frase inteira.
function searchTerms(query?: string): string[] {
  const phrase = normalizeText(query ?? "").trim();
  if (!phrase) return [];

  const keywords = phrase.split(/[^a-z0-9]+/).filter((word) => word.length >= 3 && !STOPWORDS.has(word));
  return keywords.length > 0 ? [...new Set(keywords)] : [phrase];
}

export class MemoryRepository {
  constructor(private readonly db: Database.Database) {
    // O LIKE do SQLite só ignora maiúsculas em ASCII; a busca compara o conteúdo sem acentos e em minúsculas.
    db.function("normalize_text", { deterministic: true }, (value) => normalizeText(String(value ?? "")));
  }

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

  findByContent(content: string): MemoryEntry | null {
    const row = this.db.prepare("SELECT * FROM memory WHERE content = ? LIMIT 1").get(content) as any;
    return row ? this.mapRow(row) : null;
  }

  recall(query?: string, tags?: string[], limit = 20): MemoryEntry[] {
    const terms = searchTerms(query);
    let sql = `SELECT * FROM memory`;
    const params: unknown[] = [];
    const clauses: string[] = [];

    if (terms.length > 0) {
      clauses.push(`(${terms.map(() => "normalize_text(content) LIKE ?").join(" OR ")})`);
      params.push(...terms.map((term) => `%${term}%`));
    }

    if (tags && tags.length > 0) {
      clauses.push(`(${tags.map(() => "tags LIKE ?").join(" OR ")})`);
      params.push(...tags.map((tag) => `%${tag}%`));
    }

    if (clauses.length > 0) {
      sql += ` WHERE ${clauses.join(" AND ")}`;
    }

    sql += " ORDER BY importance DESC, last_used_at DESC";

    let rows: any[];
    if (terms.length > 1) {
      // Basta uma palavra-chave para entrar; quem casa mais palavras vem primeiro (empate: ordem do SQL).
      const hits = (row: any) => {
        const content = normalizeText(row.content);
        return terms.filter((term) => content.includes(term)).length;
      };
      rows = (this.db.prepare(sql).all(...params) as any[])
        .map((row) => ({ row, hits: hits(row) }))
        .sort((a, b) => b.hits - a.hits)
        .slice(0, limit)
        .map((entry) => entry.row);
    } else {
      rows = this.db.prepare(`${sql} LIMIT ?`).all(...params, limit) as any[];
    }

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

export class ConversationRepository {
  constructor(private readonly db: Database.Database) {}

  add(role: ConversationMessage["role"], content: string): ConversationMessage {
    const record: ConversationMessage = { id: randomUUID(), role, content, createdAt: now() };
    this.db
      .prepare("INSERT INTO conversation (id, role, content, created_at) VALUES (?, ?, ?, ?)")
      .run(record.id, record.role, record.content, record.createdAt);
    return record;
  }

  // As últimas `limit` mensagens, da mais antiga para a mais nova.
  recent(limit = 20): ConversationMessage[] {
    const rows = this.db
      .prepare("SELECT * FROM conversation ORDER BY created_at DESC, rowid DESC LIMIT ?")
      .all(limit) as any[];
    return rows
      .reverse()
      .map((row) => ({ id: row.id, role: row.role, content: row.content, createdAt: row.created_at }));
  }
}

export class ReminderRepository {
  constructor(private readonly db: Database.Database) {}

  create(input: Pick<Reminder, "text" | "dueAt">): Reminder {
    const record: Reminder = { id: randomUUID(), ...input, status: "pending", createdAt: now(), firedAt: null };
    this.db
      .prepare("INSERT INTO reminders (id, text, due_at, status, created_at, fired_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(record.id, record.text, record.dueAt, record.status, record.createdAt, record.firedAt);
    return record;
  }

  list(status?: Reminder["status"]): Reminder[] {
    const rows = (
      status
        ? this.db.prepare("SELECT * FROM reminders WHERE status = ? ORDER BY due_at ASC").all(status)
        : this.db.prepare("SELECT * FROM reminders ORDER BY due_at ASC").all()
    ) as any[];
    return rows.map(this.mapRow);
  }

  // Lembretes pendentes cujo horário já chegou.
  due(at: Date = new Date()): Reminder[] {
    const rows = this.db
      .prepare("SELECT * FROM reminders WHERE status = 'pending' AND due_at <= ? ORDER BY due_at ASC")
      .all(at.toISOString()) as any[];
    return rows.map(this.mapRow);
  }

  markFired(id: string): void {
    this.db.prepare("UPDATE reminders SET status = 'fired', fired_at = ? WHERE id = ?").run(now(), id);
  }

  cancel(id: string): boolean {
    return this.db.prepare("UPDATE reminders SET status = 'cancelled' WHERE id = ? AND status = 'pending'").run(id).changes > 0;
  }

  private mapRow(row: any): Reminder {
    return {
      id: row.id,
      text: row.text,
      dueAt: row.due_at,
      status: row.status,
      createdAt: row.created_at,
      firedAt: row.fired_at
    };
  }
}

export class AgentStateStore {
  private state: AgentState;

  // Com `db`, a contagem de ciclos, o último ciclo e o intervalo sobrevivem a reinícios; o modo sempre volta a manual.
  constructor(initialIntervalMs: number, private readonly db?: Database.Database) {
    this.state = {
      mode: "manual",
      running: false,
      intervalMs: initialIntervalMs,
      currentAction: "idle",
      lastCycleAt: null,
      cycleCount: 0
    };

    const saved = db?.prepare("SELECT value FROM agent_state WHERE key = 'state'").get() as { value: string } | undefined;
    if (saved) {
      const { cycleCount, lastCycleAt, intervalMs } = parseJson<Partial<AgentState>>(saved.value);
      this.state = {
        ...this.state,
        cycleCount: cycleCount ?? 0,
        lastCycleAt: lastCycleAt ?? null,
        intervalMs: intervalMs ?? initialIntervalMs
      };
    }
  }

  get(): AgentState {
    return { ...this.state };
  }

  update(patch: Partial<AgentState>): AgentState {
    this.state = { ...this.state, ...patch };
    const { cycleCount, lastCycleAt, intervalMs } = this.state;
    this.db
      ?.prepare("INSERT INTO agent_state (key, value) VALUES ('state', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(JSON.stringify({ cycleCount, lastCycleAt, intervalMs }));
    return this.get();
  }
}
