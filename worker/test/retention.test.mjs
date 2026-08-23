import assert from "node:assert/strict";
import test from "node:test";
import { positiveInteger, retentionConfigFromEnv } from "../dist/retention/retention-config.js";

test("retention configuration uses production defaults", () => {
  assert.deepEqual(retentionConfigFromEnv({}), {
    readingRetentionDays: 1,
    auditEventRetentionDays: 7,
    cleanupIntervalMs: 3_600_000,
    batchSize: 5_000,
  });
});

test("retention configuration accepts only positive safe integers", () => {
  assert.equal(positiveInteger("2", 1), 2);
  assert.equal(positiveInteger("0", 1), 1);
  assert.equal(positiveInteger("1.5", 1), 1);
  assert.equal(positiveInteger("invalid", 1), 1);
});
