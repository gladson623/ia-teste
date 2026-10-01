import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export function createDatabase(databasePath: string): Database.Database {
  const absolutePath = path.isAbsolute(databasePath)
    ? databasePath
    : path.join(process.cwd(), databasePath);

  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const db = new Database(absolutePath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS memory (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      importance REAL NOT NULL,
      tags TEXT NOT NULL,
      metadata TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      priority REAL NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS experiences (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      goal_id TEXT,
      result TEXT NOT NULL,
      observation TEXT NOT NULL,
      learning TEXT NOT NULL,
      success INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      preconditions TEXT NOT NULL,
      steps TEXT NOT NULL,
      tools_used TEXT NOT NULL,
      related_experience_ids TEXT NOT NULL,
      success_rate REAL NOT NULL,
      version TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS personality_changes (
      id TEXT PRIMARY KEY,
      trait TEXT NOT NULL,
      value TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  return db;
}
