import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";

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

function createClient() {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (apiKey) return new GoogleGenAI({ apiKey });
  return new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT || "lawvot-382908",
    location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
  });
}

async function callTool(name: string, origin: string) {
  const paths: Record<string, string> = {
    getOntology: "/api/ontology", getClasses: "/api/classes",
    getIndividuals: "/api/individuals", getRelations: "/api/relations",
  };
  const response = await fetch(new URL(paths[name], origin));
  if (!response.ok) throw new Error(`${name} failed`);
  return response.json();
}

export async function POST(request: Request) {
  try {
    const { question } = z.object({ question: z.string().trim().min(2).max(500) }).parse(await request.json());
    const ai = createClient();
    const model = process.env.AI_MODEL_ID || process.env.VERTEX_AI_MODEL_ID || process.env.GEMINI_MODEL_ID || "gemini-2.0-flash";
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
      if (!calls.length) return Response.json({ answer: response.text || "I could not produce an answer from the semantic layer.", trace });

      const modelContent = response.candidates?.[0]?.content;
      if (modelContent) contents.push(modelContent as unknown as Record<string, unknown>);
      const parts = [];
      for (const call of calls) {
        if (!call.name || !declarations.some((item) => item.name === call.name)) throw new Error("Unsupported tool request");
        trace.push(call.name);
        const result = await callTool(call.name, request.url);
        parts.push({ functionResponse: { name: call.name, response: { result } } });
      }
      contents.push({ role: "user", parts });
    }
    throw new Error("Gemini exceeded the tool-call limit");
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Unable to answer";
    const message = raw.includes("API Key must be set")
      ? "Gemini credentials are not available in this runtime. Configure GOOGLE_API_KEY, or use the lawvot Vertex AI environment locally."
      : raw;
    return Response.json({ error: message }, { status: message.includes("Invalid") ? 400 : 500 });
  }
}
