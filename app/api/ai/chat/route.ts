import { z } from "zod";
import { applicationToolDeclarations, callApplicationTool, getToolDeclaration } from "@/lib/ai-tool-layer";
import { aiErrorResponse, aiResponseHeaders, enforceAiAllowance } from "@/lib/ai-http";
import { getGeminiClient, getGeminiModel } from "@/lib/gemini";

const SYSTEM_PROMPT = `You are the state analyst for an AI Physical Workspace.
Never assume or mention a database schema and never claim direct database or hardware access.
Always inspect the ontology first. Use only REST tool results as evidence.
Use current state for live readings, recent events to explain why something happened, and rules to explain automation behavior.
When you have enough REST tool evidence to answer, stop calling tools and return the final answer as plain text.
Use the fewest REST tool calls needed; avoid repeated or unnecessary tool calls.
Clearly distinguish simulated readings from real hardware. Be concise and answer in the user's language.`;

export async function POST(request: Request) {
  try {
    const { question } = z.object({ question: z.string().trim().min(2).max(500) }).parse(await request.json());
    const { allowance, response: limited } = await enforceAiAllowance(request);
    if (limited) return limited;
    const ai = getGeminiClient();
    const contents: Array<Record<string, unknown>> = [{ role: "user", parts: [{ text: question }] }];
    const trace: string[] = [];

    for (let turn = 0; turn < 7; turn += 1) {
      const firstTurn = turn === 0;
      const declarations = firstTurn ? [getToolDeclaration("getOntology")] : applicationToolDeclarations;
      const result = await ai.models.generateContent({
        model: getGeminiModel(), contents: contents as never,
        config: {
          systemInstruction: SYSTEM_PROMPT, tools: [{ functionDeclarations: declarations }],
          toolConfig: firstTurn ? { functionCallingConfig: { mode: "ANY" as never, allowedFunctionNames: ["getOntology"] } } : undefined,
        },
      });
      const calls = result.functionCalls ?? [];
      if (!calls.length) return Response.json(
        { answer: result.text || "I could not explain the workspace state from the available evidence.", trace, remaining: allowance.remaining },
        { headers: aiResponseHeaders(allowance.remaining) },
      );
      const modelContent = result.candidates?.[0]?.content;
      if (modelContent) contents.push(modelContent as unknown as Record<string, unknown>);
      const parts = [];
      for (const call of calls) {
        if (!call.name) throw new Error("Gemini requested an unnamed tool.");
        trace.push(call.name);
        parts.push({ functionResponse: { name: call.name, response: { result: await callApplicationTool(call.name) } } });
      }
      contents.push({ role: "user", parts });
    }
    throw new Error("Gemini exceeded the tool-call limit.");
  } catch (error) { return aiErrorResponse(error); }
}
