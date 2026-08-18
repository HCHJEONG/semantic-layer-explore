import "server-only";

import { z } from "zod";
import { getGeminiConfiguration } from "@/lib/gemini";
import { createGeminiProvider } from "@/lib/llm/gemini-provider";

export type LlmMessage = {
  role: "user" | "assistant";
  content?: string;
  toolCalls?: LlmToolCall[];
  toolResponses?: Array<{
    name: string;
    response: unknown;
  }>;
};

export type GenerateTextInput = {
  system?: string;
  messages: LlmMessage[];
  temperature?: number;
  maxOutputTokens?: number;
};

export type GenerateStructuredInput<T> = GenerateTextInput & {
  schema: z.ZodType<T>;
  schemaName: string;
};

export type LlmToolDeclaration = {
  name: string;
  description: string;
  parameters: unknown;
};

export type LlmToolCall = {
  name: string;
  args: Record<string, unknown>;
};

export type GenerateWithToolsInput = GenerateTextInput & {
  tools: LlmToolDeclaration[];
  toolChoice?: {
    mode: "any";
    allowedToolNames: string[];
  };
};

export type GenerateWithToolsResult = {
  text: string;
  toolCalls: LlmToolCall[];
  assistantMessage?: LlmMessage;
};

export type LlmProvider = {
  id: string;
  model: string;
  generateText(input: GenerateTextInput): Promise<{ text: string }>;
  generateStructured<T>(input: GenerateStructuredInput<T>): Promise<T>;
  generateWithTools(input: GenerateWithToolsInput): Promise<GenerateWithToolsResult>;
};

export type LlmProviderConfiguration = {
  provider: string;
  configured: boolean;
  model: string;
  location?: string;
};

export function getLlmProvider(): LlmProvider {
  const provider = process.env.LLM_PROVIDER?.trim().toLowerCase() || "gemini";
  if (provider === "gemini") return createGeminiProvider();
  throw new Error(`Unsupported LLM provider: ${provider}`);
}

export function getLlmProviderConfiguration(): LlmProviderConfiguration {
  const provider = process.env.LLM_PROVIDER?.trim().toLowerCase() || "gemini";
  if (provider === "gemini") {
    const gemini = getGeminiConfiguration();
    return { provider, configured: gemini.configured, model: gemini.model, location: gemini.location };
  }
  throw new Error(`Unsupported LLM provider: ${provider}`);
}
