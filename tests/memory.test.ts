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

const PROJECT = "O usuário desenvolverá um projeto de realidade virtual chamado Mordomo AI para o Meta Quest 3.";

function seedMemories(repo: MemoryRepository) {
  const base = { type: "knowledge" as const, tags: [], metadata: {}, source: "test" };
  repo.create({ ...base, content: PROJECT, importance: 0.6 });
  repo.create({ ...base, content: "Técnicas de jardinagem exigem rega regular.", importance: 0.9 });
  repo.create({ ...base, content: "O projeto da horta fica no quintal.", importance: 0.9 });
}

test("recall finds a memory by the keywords of a natural question", () => {
  const { db, cleanup } = createTestDb();
  const repo = new MemoryRepository(db);
  seedMemories(repo);

  const recalled = repo.recall("como se chama meu projeto?");

  // "chama" e "projeto" casam com a memória do projeto; a da horta só casa "projeto"; jardinagem não entra.
  assert.deepEqual(recalled.map((memory) => memory.content), [PROJECT, "O projeto da horta fica no quintal."]);

  cleanup();
});

test("recall ignores accents and case, and still accepts short or stopword-only queries", () => {
  const { db, cleanup } = createTestDb();
  const repo = new MemoryRepository(db);
  seedMemories(repo);

  assert.equal(repo.recall("TECNICAS de jardinagem")[0].content, "Técnicas de jardinagem exigem rega regular.");
  assert.equal(repo.recall("usuario")[0].content, PROJECT);
  assert.equal(repo.recall("AI")[0].content, PROJECT);
  assert.equal(repo.recall("assunto inexistente").length, 0);
  assert.equal(repo.recall(undefined, undefined, 10).length, 3);

  cleanup();
});
