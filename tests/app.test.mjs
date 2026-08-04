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
