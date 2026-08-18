import "server-only";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type ServiceAccountCredentials = Record<string, unknown> & {
  client_email?: string;
  private_key?: string;
  project_id?: string;
  token_uri?: string;
};

type GeminiContent = { role?: string; parts?: Array<Record<string, unknown>> };
type GeminiResponse = {
  candidates?: Array<{ content?: GeminiContent }>;
  functionCalls?: Array<{ name?: string; args?: Record<string, unknown> }>;
  text?: string;
};

let accessToken: { value: string; expiresAt: number } | null = null;

const generationConfigFields = new Set([
  "candidateCount",
  "frequencyPenalty",
  "maxOutputTokens",
  "presencePenalty",
  "responseMimeType",
  "responseSchema",
  "seed",
  "stopSequences",
  "temperature",
  "topK",
  "topP",
]);

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function fetchGeminiResource(stage: "OAuth token" | "Vertex generateContent", input: string, init: RequestInit) {
  try {
    return await fetch(input, init);
  } catch (error) {
    throw new Error(`${stage} request failed.`, { cause: error });
  }
}

async function getAccessToken(credentials: ServiceAccountCredentials) {
  if (accessToken && accessToken.expiresAt > Date.now() + 60_000) return accessToken.value;
  if (!credentials.client_email || !credentials.private_key || !credentials.token_uri) {
    throw new Error("Google Cloud service account credentials are incomplete.");
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: credentials.token_uri,
    iat: issuedAt,
    exp: issuedAt + 3600,
  })}`;
  const assertion = `${unsigned}.${crypto.sign("RSA-SHA256", Buffer.from(unsigned), credentials.private_key).toString("base64url")}`;
  const response = await fetchGeminiResource("OAuth token", credentials.token_uri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const result = await response.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !result.access_token) throw new Error(result.error_description || `Google OAuth failed with ${response.status}.`);
  accessToken = { value: result.access_token, expiresAt: Date.now() + (result.expires_in || 3600) * 1000 };
  return accessToken.value;
}

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
  const config = getGeminiConfiguration();
  if (!config.credentials) throw new Error("Google Cloud credentials are unavailable.");
  if (!config.project) throw new Error("The Google Cloud project is missing from the service account credentials.");
  return {
    models: {
      async generateContent(input: { model: string; contents: GeminiContent[]; config?: Record<string, unknown> }): Promise<GeminiResponse> {
        const token = await getAccessToken(config.credentials!);
        const endpoint = `https://aiplatform.googleapis.com/v1/projects/${encodeURIComponent(config.project!)}/locations/${encodeURIComponent(config.location)}/publishers/google/models/${encodeURIComponent(input.model)}:generateContent`;
        const requestConfig = { ...input.config };
        if (typeof requestConfig.systemInstruction === "string") {
          requestConfig.systemInstruction = { parts: [{ text: requestConfig.systemInstruction }] };
        }
        const generationConfig = { ...(requestConfig.generationConfig as Record<string, unknown> | undefined) };
        for (const field of generationConfigFields) {
          if (field in requestConfig) {
            generationConfig[field] = requestConfig[field];
            delete requestConfig[field];
          }
        }
        if (Object.keys(generationConfig).length > 0) requestConfig.generationConfig = generationConfig;
        const response = await fetchGeminiResource("Vertex generateContent", endpoint, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ contents: input.contents, ...requestConfig }),
        });
        const result = await response.json() as GeminiResponse & { error?: { message?: string } };
        if (!response.ok) throw new Error(result.error?.message || `Vertex AI failed with ${response.status}.`);
        const parts = result.candidates?.[0]?.content?.parts ?? [];
        result.functionCalls = parts.flatMap((part) => part.functionCall ? [part.functionCall as { name?: string; args?: Record<string, unknown> }] : []);
        result.text = parts.flatMap((part) => typeof part.text === "string" ? [part.text] : []).join("");
        return result;
      },
    },
  };
}
