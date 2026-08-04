import "server-only";

import { Type } from "@google/genai";
import { getInternalApiUrl } from "@/lib/internal-api";

export const applicationToolDeclarations = [
  { name: "getOntology", description: "Inspect the semantic layer before using operational data.", parameters: { type: Type.OBJECT, properties: {} } },
  { name: "getCurrentState", description: "Fetch current sensors, readings, and device states through the REST API.", parameters: { type: Type.OBJECT, properties: {} } },
  { name: "getSensors", description: "Fetch available sensors and their latest readings through the REST API.", parameters: { type: Type.OBJECT, properties: {} } },
  { name: "getDevices", description: "Fetch available devices, types, commands, and states through the REST API.", parameters: { type: Type.OBJECT, properties: {} } },
  { name: "getRecentEvents", description: "Fetch the recent auditable event timeline through the REST API.", parameters: { type: Type.OBJECT, properties: {} } },
  { name: "getRules", description: "Fetch approved automation rules through the REST API.", parameters: { type: Type.OBJECT, properties: {} } },
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
