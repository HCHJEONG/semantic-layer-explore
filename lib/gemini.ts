import "server-only";

import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";
import path from "node:path";

let client: GoogleGenAI | null = null;

export function getGeminiModel() {
  return process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
}

export function getGeminiClient() {
  if (client) return client;

  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION?.trim() || "global";
  const configuredPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  const credentialsPath = configuredPath
    ? path.isAbsolute(configuredPath) ? configuredPath : path.resolve(/* turbopackIgnore: true */ process.cwd(), configuredPath)
    : undefined;

  let credentials: Record<string, unknown> | undefined;
  if (credentialsPath && fs.existsSync(credentialsPath)) {
    credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8")) as Record<string, unknown>;
  }

  if (!project) throw new Error("GOOGLE_CLOUD_PROJECT is required for Gemini.");
  if (!credentials) throw new Error("Google Cloud credentials are unavailable.");

  client = new GoogleGenAI({
    vertexai: true,
    project,
    location,
    googleAuthOptions: { credentials },
  });
  return client;
}
