import test from "node:test";
import assert from "node:assert/strict";
import { MemoryRepository } from "../src/memory/repositories";
import { createTestDb } from "./helpers";

test("memory repository stores and recalls entries", () => {
  const { db, cleanup } = createTestDb();
  const repo = new MemoryRepository(db);

  repo.create({
    type: "knowledge",
    content: "Node.js suporta TypeScript via build",
    importance: 0.7,
    tags: ["node", "typescript"],
    metadata: { source: "test" },
    source: "test"
  });

  const recalled = repo.recall("TypeScript", ["node"], 10);
  assert.equal(recalled.length, 1);
  assert.equal(recalled[0].type, "knowledge");

  cleanup();
});
