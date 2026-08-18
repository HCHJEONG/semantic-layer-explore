import "server-only";

import type { LlmToolDeclaration } from "@/lib/llm/provider";
import { getInternalApiUrl } from "@/lib/internal-api";

const emptyObjectParameters = { type: "object", properties: {}, additionalProperties: false };

export const applicationToolDeclarations: LlmToolDeclaration[] = [
  { name: "getOntology", description: "Inspect the semantic layer before using operational data.", parameters: emptyObjectParameters },
  { name: "getCurrentState", description: "Fetch current sensors, readings, and device states through the REST API.", parameters: emptyObjectParameters },
  { name: "getSensors", description: "Fetch available sensors and their latest readings through the REST API.", parameters: emptyObjectParameters },
  { name: "getDevices", description: "Fetch available devices, types, commands, and states through the REST API.", parameters: emptyObjectParameters },
  { name: "getRecentEvents", description: "Fetch the recent auditable event timeline through the REST API.", parameters: emptyObjectParameters },
  { name: "getRules", description: "Fetch approved automation rules through the REST API.", parameters: emptyObjectParameters },
];

const toolPaths: Record<string, string> = {
  getOntology: "/api/ontology",
  getCurrentState: "/api/state",
  getSensors: "/api/sensors",
  getDevices: "/api/devices",
  getRecentEvents: "/api/events?limit=50",
  getRules: "/api/rules",
};

export function getToolDeclaration(name: string) {
  const declaration = applicationToolDeclarations.find((item) => item.name === name);
  if (!declaration) throw new Error(`Unsupported tool: ${name}`);
  return declaration;
}

export async function callApplicationTool(name: string) {
  const path = toolPaths[name];
  if (!path) throw new Error(`Unsupported tool: ${name}`);
  const response = await fetch(getInternalApiUrl(path), { cache: "no-store" });
  if (!response.ok) throw new Error(`${name} failed with ${response.status}`);
  return response.json();
}
