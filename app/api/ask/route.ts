import { z } from "zod";
import { consumeAskAllowance } from "@/lib/rate-limit";
import { getInternalApiUrl } from "@/lib/internal-api";
import { getLlmProvider, type LlmMessage } from "@/lib/llm/provider";

const SYSTEM_PROMPT = `You are an AI assistant that understands the Semantic Layer exposed by this application.
Never assume a database schema. Never claim to access a database directly.
Always inspect the ontology first, then use classes, properties, individuals, and relationships before answering.
If additional data is required, request the appropriate REST API tool.
Answer only from tool results. Be concise and answer in the same language as the user's question.`;

const declarations = ["getOntology", "getClasses", "getIndividuals", "getRelations"].map((name) => ({
  name,
  description: name === "getOntology" ? "Inspect the semantic layer before any other lookup." : `Fetch ${name.slice(3).toLowerCase()} through the REST API.`,
  parameters: { type: "OBJECT", properties: {} },
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
    const provider = getLlmProvider();
    const messages: LlmMessage[] = [{ role: "user", content: question }];
    const trace: string[] = [];

    for (let turn = 0; turn < 6; turn += 1) {
      const response = await provider.generateWithTools({
        system: SYSTEM_PROMPT,
        messages,
        tools: turn === 0 ? [declarations[0]] : declarations,
        toolChoice: turn === 0 ? { mode: "any", allowedToolNames: ["getOntology"] } : undefined,
      });
      const calls = response.toolCalls;
      if (!calls.length) return Response.json(
        { answer: response.text || "I could not produce an answer from the semantic layer.", trace, remaining: allowance.remaining },
        { headers: { "x-ratelimit-limit": "10", "x-ratelimit-remaining": String(allowance.remaining) } },
      );

      if (response.assistantMessage) messages.push(response.assistantMessage);
      const toolResponses = [];
      for (const call of calls) {
        if (!declarations.some((item) => item.name === call.name)) throw new Error("Unsupported tool request");
        trace.push(call.name);
        const result = await callTool(call.name);
        toolResponses.push({ name: call.name, response: { result } });
      }
      messages.push({ role: "user", toolResponses });
    }
    throw new Error(`${provider.id} exceeded the tool-call limit`);
  } catch (error) {
    console.error("Ontology AI request failed", error);
    const raw = error instanceof Error ? error.message : "Unable to answer";
    const message = raw.includes("credentials are unavailable")
      ? "LLM credentials are not available in this runtime."
      : raw;
    return Response.json({ error: message }, { status: message.includes("Invalid") ? 400 : 500 });
  }
}
