import "server-only";

import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getDatabasePath, getDb } from "@/db";

export type DatabaseStatus = {
  status: "ready";
  path: string;
};

export type DatabaseStore = {
  getStatus(): Promise<DatabaseStatus>;
  deleteInBatches(statement: (batchSize: number) => SQL, batchSize: number): Promise<number>;
};

export function getDatabaseStore(): DatabaseStore {
  return {
    async getStatus() {
      getDb().run(sql`select 1`);
      return { status: "ready", path: getDatabasePath() };
    },
    async deleteInBatches(statement, batchSize) {
      let deleted = 0;
      while (true) {
        const result = getDb().run(statement(batchSize));
        deleted += result.changes;
        if (result.changes < batchSize) return deleted;
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    },
  };
}
