import "server-only";

import { getGeminiClient, getGeminiModel } from "@/lib/gemini";
import type { GenerateTextInput, LlmMessage, LlmProvider, LlmToolDeclaration } from "@/lib/llm/provider";

function toGeminiContents(input: GenerateTextInput) {
  return input.messages
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: message.toolCalls?.length
        ? message.toolCalls.map((toolCall) => ({
            functionCall: { name: toolCall.name, args: toolCall.args },
          }))
        : message.toolResponses?.length
        ? message.toolResponses.map((toolResponse) => ({
            functionResponse: { name: toolResponse.name, response: toolResponse.response },
          }))
        : [{ text: message.content ?? "" }],
    }));
}

function fromGeminiAssistantMessage(content: { role?: string; parts?: Array<Record<string, unknown>> } | undefined): LlmMessage | undefined {
  if (!content) return undefined;
  const text = content.parts?.flatMap((part) => typeof part.text === "string" ? [part.text] : []).join("");
  const toolCalls = content.parts?.flatMap((part) => {
    const call = part.functionCall as { name?: string; args?: Record<string, unknown> } | undefined;
    return call?.name ? [{ name: call.name, args: call.args ?? {} }] : [];
  }) ?? [];
  return {
    role: "assistant",
    ...(text ? { content: text } : {}),
    ...(toolCalls.length ? { toolCalls } : {}),
  };
}

function generationConfig(input: GenerateTextInput) {
  return {
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    ...(input.maxOutputTokens !== undefined ? { maxOutputTokens: input.maxOutputTokens } : {}),
  };
}

function toGeminiTool(tool: LlmToolDeclaration) {
  return {
    ...tool,
    parameters: normalizeGeminiSchema(tool.parameters),
  };
}

function normalizeGeminiSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(normalizeGeminiSchema);
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "type" && typeof value === "string") {
      normalized[key] = value.toUpperCase();
    } else if (key === "properties" && value && typeof value === "object" && !Array.isArray(value)) {
      normalized[key] = Object.fromEntries(Object.entries(value).map(([propertyKey, propertyValue]) => [propertyKey, normalizeGeminiSchema(propertyValue)]));
    } else if (key !== "additionalProperties") {
      normalized[key] = normalizeGeminiSchema(value);
    }
  }
  return normalized;
}

export function createGeminiProvider(): LlmProvider {
  const model = getGeminiModel();
  return {
    id: "gemini",
    model,
    async generateText(input) {
      const result = await getGeminiClient().models.generateContent({
        model,
        contents: toGeminiContents(input),
        config: {
          ...generationConfig(input),
          systemInstruction: input.system,
        },
      });
      return { text: result.text || "" };
    },
    async generateStructured(input) {
      const result = await getGeminiClient().models.generateContent({
        model,
        contents: toGeminiContents(input),
        config: {
          ...generationConfig(input),
          systemInstruction: input.system,
          responseMimeType: "application/json",
        },
      });
      return input.schema.parse(JSON.parse(result.text || "{}"));
    },
    async generateWithTools(input) {
      const result = await getGeminiClient().models.generateContent({
        model,
        contents: toGeminiContents(input),
        config: {
          ...generationConfig(input),
          systemInstruction: input.system,
          tools: [{ functionDeclarations: input.tools.map(toGeminiTool) }],
          toolConfig: input.toolChoice ? {
            functionCallingConfig: {
              mode: "ANY" as never,
              allowedFunctionNames: input.toolChoice.allowedToolNames,
            },
          } : undefined,
        },
      });
      return {
        text: result.text || "",
        toolCalls: (result.functionCalls ?? []).flatMap((call) => call.name ? [{ name: call.name, args: call.args ?? {} }] : []),
        assistantMessage: fromGeminiAssistantMessage(result.candidates?.[0]?.content),
      };
    },
  };
}
