import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../src/memory/database";

export function createTestDb() {
  const testPath = path.join("/tmp", `mordomo-test-${randomUUID()}.sqlite`);
  const db = createDatabase(testPath);
  return {
    db,
    path: testPath,
    cleanup: () => {
      db.close();
      if (fs.existsSync(testPath)) fs.unlinkSync(testPath);
    }
  };
}
