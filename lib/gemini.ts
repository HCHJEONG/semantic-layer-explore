import "server-only";

import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";
import path from "node:path";

type ServiceAccountCredentials = Record<string, unknown> & { project_id?: string };

let client: GoogleGenAI | null = null;

export function getGeminiModel() {
  return process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
}

function loadCredentials() {
  const configuredPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  const credentialsPath = configuredPath
    ? path.isAbsolute(configuredPath) ? configuredPath : path.resolve(/* turbopackIgnore: true */ process.cwd(), configuredPath)
    : undefined;
  if (!credentialsPath || !fs.existsSync(credentialsPath)) return undefined;
  return JSON.parse(fs.readFileSync(credentialsPath, "utf8")) as ServiceAccountCredentials;
}

export function getGeminiConfiguration() {
  const credentials = loadCredentials();
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim() || credentials?.project_id?.trim();
  const location = process.env.GOOGLE_CLOUD_LOCATION?.trim() || "global";
  return { configured: Boolean(project && credentials), credentials, project, location, model: getGeminiModel() };
}

export function getGeminiClient() {
  if (client) return client;
  const config = getGeminiConfiguration();
  if (!config.credentials) throw new Error("Google Cloud credentials are unavailable.");
  if (!config.project) throw new Error("The Google Cloud project is missing from the service account credentials.");

  client = new GoogleGenAI({
    vertexai: true,
    project: config.project,
    location: config.location,
    googleAuthOptions: { credentials: config.credentials },
  });
  return client;
}
