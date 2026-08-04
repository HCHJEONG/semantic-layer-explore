import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const port = 32147;
const origin = `http://127.0.0.1:${port}`;
let server;
let tempDirectory;

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Next.js test server did not become healthy.");
}

test.before(async () => {
  tempDirectory = await mkdtemp(path.join(os.tmpdir(), "physical-ai-test-"));
  server = spawn(process.execPath, [".next/standalone/server.js"], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: {
      ...process.env,
      DATABASE_PATH: path.join(tempDirectory, "ontology.sqlite"),
      PHYSICAL_ADAPTER: "simulator",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForServer();
});

test.after(async () => {
  if (server && server.exitCode === null) {
    server.kill();
    await once(server, "exit");
  }
  if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true });
});

test("health and readiness endpoints describe the runtime", async () => {
  const [healthResponse, readyResponse] = await Promise.all([
    fetch(`${origin}/api/health`),
    fetch(`${origin}/api/ready`),
  ]);

  assert.equal(healthResponse.status, 200);
  assert.equal(readyResponse.status, 200);

  const health = await healthResponse.json();
  const ready = await readyResponse.json();
  assert.equal(health.status, "ok");
  assert.equal(health.service, "ai-physical-workspace");
  assert.equal(ready.status, "ready");
  assert.equal(ready.database.status, "ready");
  assert.equal(ready.physicalAdapter, "simulator");
  assert.equal(ready.gemini.model, "gemini-3.5-flash-lite");
});

test("ontology API preserves the original semantic-layer contract", async () => {
  const response = await fetch(`${origin}/api/ontology`);
  assert.equal(response.status, 200);
  const ontology = await response.json();

  assert.deepEqual(ontology.classes.map(({ name }) => name), ["Person", "Company", "Project"]);
  assert.deepEqual(ontology.properties.map(({ name, domain, range }) => ({ name, domain, range })), [
    { name: "worksFor", domain: "Person", range: "Company" },
    { name: "assignedTo", domain: "Person", range: "Project" },
  ]);
  assert.deepEqual(ontology.individuals.map(({ name, class: className }) => ({ name, class: className })), [
    { name: "Alice", class: "Person" },
    { name: "Bob", class: "Person" },
    { name: "OpenAI", class: "Company" },
    { name: "Semantic Explorer", class: "Project" },
  ]);
  assert.deepEqual(ontology.relations.map(({ subject, property, object }) => ({ subject, property, object })), [
    { subject: "Alice", property: "worksFor", object: "OpenAI" },
    { subject: "Bob", property: "worksFor", object: "OpenAI" },
    { subject: "Bob", property: "assignedTo", object: "Semantic Explorer" },
  ]);
});

test("main page keeps the Semantic Layer Explorer baseline", async () => {
  const response = await fetch(origin);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Semantic Layer Explorer/);
  assert.match(html, /Ask AI/);
  assert.doesNotMatch(html, /Your site is taking shape/);
});

test("simulator exposes four sensors and four virtual devices", async () => {
  const response = await fetch(`${origin}/api/state`);
  assert.equal(response.status, 200);
  const state = await response.json();
  assert.equal(state.mode, "simulator");
  assert.equal(state.connection.state, "connected");
  assert.deepEqual(state.sensors.map(({ type }) => type), ["temperature", "light", "distance", "button"]);
  assert.deepEqual(state.devices.map(({ type }) => type), ["led", "servo", "buzzer", "relay"]);
  assert.equal(state.readings.length, 4);
});

test("scenario and manual readings use the same sensor event contract", async () => {
  const scenarioResponse = await fetch(`${origin}/api/simulator/scenarios/high-temperature`, { method: "POST" });
  assert.equal(scenarioResponse.status, 200);
  const state = await scenarioResponse.json();
  const temperature = state.readings.find(({ sensorId }) => sensorId === "temperature-01");
  assert.equal(temperature.value, 31.5);
  assert.equal(temperature.source, "simulator");

  const manualResponse = await fetch(`${origin}/api/simulator/sensors/light-01/readings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: 42 }),
  });
  assert.equal(manualResponse.status, 201);
  const reading = await manualResponse.json();
  assert.equal(reading.sensorId, "light-01");
  assert.equal(reading.value, 42);
});

test("virtual device commands update state and write auditable events", async () => {
  const commandResponse = await fetch(`${origin}/api/devices/led-01/commands`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ command: "on" }),
  });
  assert.equal(commandResponse.status, 200);
  const commandResult = await commandResponse.json();
  assert.equal(commandResult.success, true);
  assert.equal(commandResult.state.status, "on");

  const eventsResponse = await fetch(`${origin}/api/events?limit=100`);
  assert.equal(eventsResponse.status, 200);
  const events = await eventsResponse.json();
  assert.ok(events.some(({ type }) => type === "sensor.reading"));
  assert.ok(events.some(({ type, sourceId }) => type === "device.command.succeeded" && sourceId === "led-01"));
});

test("rules are validated, editable, and execute device commands from sensor events", async () => {
  const invalidResponse = await fetch(`${origin}/api/rules`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Invalid unit", condition: { sensorId: "temperature-01", operator: "gt", value: 30, unit: "lux" },
      action: { deviceId: "relay-fan-01", command: "on" },
    }),
  });
  assert.equal(invalidResponse.status, 400);

  const createResponse = await fetch(`${origin}/api/rules`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Cool the workspace", description: "Turn on the fan above 30 C",
      condition: { sensorId: "temperature-01", operator: "gt", value: 30, unit: "celsius" },
      action: { deviceId: "relay-fan-01", command: "on" }, enabled: true, cooldownSeconds: 60,
    }),
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();

  const patchResponse = await fetch(`${origin}/api/rules/${created.id}`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "High temperature fan" }),
  });
  assert.equal(patchResponse.status, 200);
  assert.equal((await patchResponse.json()).name, "High temperature fan");

  const readingResponse = await fetch(`${origin}/api/simulator/sensors/temperature-01/readings`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ value: 32 }),
  });
  assert.equal(readingResponse.status, 201);

  let state;
  let eventLog = [];
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    [state, eventLog] = await Promise.all([
      fetch(`${origin}/api/state`).then((response) => response.json()),
      fetch(`${origin}/api/events?limit=200`).then((response) => response.json()),
    ]);
    if (eventLog.some(({ type, sourceId }) => type === "rule.matched" && sourceId === created.id)) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(state.devices.find(({ id }) => id === "relay-fan-01").state.status, "on");
  assert.equal(eventLog.filter(({ type, sourceId }) => type === "rule.matched" && sourceId === created.id).length, 1);
  assert.ok(eventLog.some(({ type, payload }) => type === "device.command.succeeded" && payload.command.issuedBy === "rule-engine"));

  const disableResponse = await fetch(`${origin}/api/rules/${created.id}/disable`, { method: "POST" });
  assert.equal(disableResponse.status, 200);
  assert.equal((await disableResponse.json()).enabled, false);

  const deleteResponse = await fetch(`${origin}/api/rules/${created.id}`, { method: "DELETE" });
  assert.equal(deleteResponse.status, 204);
  assert.equal((await fetch(`${origin}/api/rules/${created.id}`)).status, 404);
});
