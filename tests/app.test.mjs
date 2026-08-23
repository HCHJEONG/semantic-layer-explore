import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (file) => readFile(path.join(root, file), "utf8");

async function sourceFiles(directory = root) {
  const ignored = new Set([".git", ".next", "node_modules", "dist", "target", ".fordeploy", "docs"]);
  const out = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...await sourceFiles(absolute));
    else if (/\.(?:ts|tsx|js|mjs|json|ya?ml)$/.test(entry.name)) out.push(absolute);
  }
  return out;
}

test("Next.js BFF routes use the Go Gateway as their only data boundary", async () => {
  const routes = await Promise.all([
    "app/api/ontology/route.ts", "app/api/state/route.ts", "app/api/events/route.ts",
    "app/api/rules/route.ts", "app/api/devices/route.ts", "app/api/sensors/route.ts",
  ].map(read));
  for (const route of routes) {
    assert.match(route, /proxy(?:Ontology|Operations)/);
    assert.doesNotMatch(route, /usesLegacy|getWorkspaceRuntime|get.*Store/);
  }
});

test("SQLite and Drizzle cannot re-enter application source or dependencies", async () => {
  const files = await sourceFiles();
  const matches = [];
  for (const file of files) {
    if (file === fileURLToPath(import.meta.url)) continue;
    const content = await readFile(file, "utf8");
    if (/better-sqlite3|drizzle-orm|DATABASE_PATH|DB_PROVIDER|BACKEND.*sqlite/i.test(content)) matches.push(path.relative(root, file));
  }
  assert.deepEqual(matches, []);
  const packageJson = JSON.parse(await read("package.json"));
  assert.equal(packageJson.dependencies?.["better-sqlite3"], undefined);
  assert.equal(packageJson.dependencies?.["drizzle-orm"], undefined);
});

test("Ask AI and Rule Proposal keep ontology-first tool calling", async () => {
  const [chatRoute, proposalRoute] = await Promise.all([read("app/api/ai/chat/route.ts"), read("app/api/ai/rules/propose/route.ts")]);
  assert.match(chatRoute, /allowedToolNames:\s*\["getOntology"\]/);
  assert.match(proposalRoute, /\["getOntology",\s*"getSensors",\s*"getDevices"\]/);
});

test("Semantic Map keeps the in-place Neo4j projection view", async () => {
  const graph = await read("components/ontology/ontology-graph.tsx");
  assert.match(graph, /aria-label="Graph data source"/);
  assert.match(graph, /\/api\/graph\/ontology/);
  assert.match(graph, /\/api\/graph\/projection\/rebuild/);
});

test("MQTT command contracts preserve versioned command and ACK envelopes", async () => {
  const command = JSON.parse(await read("contracts/command.schema.json"));
  const result = JSON.parse(await read("contracts/command-result.schema.json"));
  assert.equal(command.properties.schemaVersion.const, "command.v1");
  assert.equal(result.properties.schemaVersion.const, "command-result.v1");
  assert.ok(command.required.includes("commandId"));
  assert.ok(result.required.includes("success"));
});

test("Python virtual-device failure defaults to one percent", async () => {
  const [simulator, compose] = await Promise.all([read("telemetry-simulator/simulator.py"), read("compose.yaml")]);
  assert.match(simulator, /SIM_COMMAND_FAILURE_RATE", 0\.01/);
  assert.match(compose, /SIM_COMMAND_FAILURE_RATE:-0\.01/);
});
