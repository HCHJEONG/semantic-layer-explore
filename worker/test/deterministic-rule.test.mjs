import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, matchesCondition } from "../dist/rules/deterministic-rule.js";

const event = { schemaVersion: "telemetry.v1", eventId: "event-1", deviceId: "source-1", sensorId: "temperature-01", sequence: 1, measuredAt: "2026-08-23T00:00:00Z", payload: { kind: "temperature", value: 31.5, unit: "celsius" } };

test("numeric and boolean conditions are deterministic", () => {
  assert.equal(matchesCondition({ operator: "gte", value: 30, unit: "celsius" }, event), true);
  assert.equal(matchesCondition({ operator: "lt", value: 30, unit: "celsius" }, event), false);
  assert.equal(matchesCondition({ operator: "gte", value: 30, unit: "lux" }, event), false);
  assert.equal(matchesCondition({ operator: "eq", value: true, unit: "boolean" }, { ...event, payload: { kind: "button", value: true, unit: "boolean" } }), true);
});

test("device actions validate type and produce stable state", () => {
  assert.deepEqual(applyAction("relay", { status: "off" }, { deviceId: "relay-1", command: "on" }, "now"), { status: "on", lastCommandAt: "now" });
  assert.deepEqual(applyAction("servo", { status: "off", angle: 90 }, { deviceId: "servo-1", command: "set-angle", value: 45 }, "now"), { status: "on", angle: 45, lastCommandAt: "now" });
  assert.throws(() => applyAction("servo", {}, { deviceId: "servo-1", command: "on" }, "now"));
});
