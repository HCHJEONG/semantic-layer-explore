import { Type } from "@google/genai";
import { z } from "zod";
import { consumeAskAllowance } from "@/lib/rate-limit";
import { getGeminiClient, getGeminiModel } from "@/lib/gemini";
import { getInternalApiUrl } from "@/lib/internal-api";

const SYSTEM_PROMPT = `You are an AI assistant that understands the Semantic Layer exposed by this application.
Never assume a database schema. Never claim to access a database directly.
Always inspect the ontology first, then use classes, properties, individuals, and relationships before answering.
If additional data is required, request the appropriate REST API tool.
Answer only from tool results. Be concise and answer in the same language as the user's question.`;

const declarations = ["getOntology", "getClasses", "getIndividuals", "getRelations"].map((name) => ({
  name,
  description: name === "getOntology" ? "Inspect the semantic layer before any other lookup." : `Fetch ${name.slice(3).toLowerCase()} through the REST API.`,
  parameters: { type: Type.OBJECT, properties: {} },
}));

async function callTool(name: string) {
  const paths: Record<string, string> = {
    getOntology: "/api/ontology", getClasses: "/api/classes",
    getIndividuals: "/api/individuals", getRelations: "/api/relations",
  };
  const response = await fetch(getInternalApiUrl(paths[name]), { cache: "no-store" });
  if (!response.ok) throw new Error(`${name} failed`);
  return response.json();
}

export async function POST(request: Request) {
  try {
    const { question } = z.object({ question: z.string().trim().min(2).max(500) }).parse(await request.json());
    const allowance = await consumeAskAllowance(request);
    if (!allowance.allowed) return Response.json(
      { error: "Daily Ask AI limit reached. Please try again tomorrow." },
      { status: 429, headers: { "retry-after": String(allowance.resetSeconds), "x-ratelimit-limit": "10", "x-ratelimit-remaining": "0" } },
    );
    const ai = getGeminiClient();
    const model = getGeminiModel();
    const contents: Array<Record<string, unknown>> = [{ role: "user", parts: [{ text: question }] }];
    const trace: string[] = [];

    for (let turn = 0; turn < 6; turn += 1) {
      const response = await ai.models.generateContent({
        model, contents: contents as never,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          tools: [{ functionDeclarations: turn === 0 ? [declarations[0]] : declarations }],
          toolConfig: turn === 0 ? { functionCallingConfig: { mode: "ANY" as never, allowedFunctionNames: ["getOntology"] } } : undefined,
        },
      });
      const calls = response.functionCalls ?? [];
      if (!calls.length) return Response.json(
        { answer: response.text || "I could not produce an answer from the semantic layer.", trace, remaining: allowance.remaining },
        { headers: { "x-ratelimit-limit": "10", "x-ratelimit-remaining": String(allowance.remaining) } },
      );

      const modelContent = response.candidates?.[0]?.content;
      if (modelContent) contents.push(modelContent as unknown as Record<string, unknown>);
      const parts = [];
      for (const call of calls) {
        if (!call.name || !declarations.some((item) => item.name === call.name)) throw new Error("Unsupported tool request");
        trace.push(call.name);
        const result = await callTool(call.name);
        parts.push({ functionResponse: { name: call.name, response: { result } } });
      }
      contents.push({ role: "user", parts });
    }
    throw new Error("Gemini exceeded the tool-call limit");
  } catch (error) {
    console.error("Ontology AI request failed", error);
    const raw = error instanceof Error ? error.message : "Unable to answer";
    const message = raw.includes("credentials are unavailable")
      ? "Gemini credentials are not available in this runtime."
      : raw;
    return Response.json({ error: message }, { status: message.includes("Invalid") ? 400 : 500 });
  }
}
