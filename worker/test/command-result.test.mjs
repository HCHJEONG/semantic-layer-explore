import assert from "node:assert/strict";
import test from "node:test";
import { parseCommandResult } from "../dist/contracts/command-result.js";

test("command result contract accepts ACK state and rejects incomplete payloads", () => {
  const result = parseCommandResult(Buffer.from(JSON.stringify({
    schemaVersion: "command-result.v1",
    commandId: "command-1",
    deviceId: "relay-fan-01",
    success: true,
    state: { status: "on" },
    occurredAt: "2026-08-23T00:00:00Z",
  })));
  assert.equal(result.state.status, "on");
  assert.throws(() => parseCommandResult(Buffer.from('{"schemaVersion":"command-result.v1"}')));
});
