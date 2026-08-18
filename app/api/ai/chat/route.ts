import { z } from "zod";
import { applicationToolDeclarations, callApplicationTool, getToolDeclaration } from "@/lib/ai-tool-layer";
import { aiAllowanceHeaders, aiErrorResponse, enforceAiAllowance } from "@/lib/ai-http";
import { getLlmProvider, type LlmMessage } from "@/lib/llm/provider";

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
    const provider = getLlmProvider();
    const messages: LlmMessage[] = [{ role: "user", content: question }];
    const trace: string[] = [];

    for (let turn = 0; turn < 7; turn += 1) {
      const firstTurn = turn === 0;
      const declarations = firstTurn ? [getToolDeclaration("getOntology")] : applicationToolDeclarations;
      const result = await provider.generateWithTools({
        system: SYSTEM_PROMPT,
        messages,
        tools: declarations,
        toolChoice: firstTurn ? { mode: "any", allowedToolNames: ["getOntology"] } : undefined,
      });
      const calls = result.toolCalls;
      if (!calls.length) return Response.json(
        { answer: result.text || "I could not explain the workspace state from the available evidence.", trace, remaining: allowance.remaining },
        { headers: aiAllowanceHeaders(allowance) },
      );
      if (result.assistantMessage) messages.push(result.assistantMessage);
      const toolResponses = [];
      for (const call of calls) {
        trace.push(call.name);
        toolResponses.push({ name: call.name, response: { result: await callApplicationTool(call.name) } });
      }
      messages.push({ role: "user", toolResponses });
    }
    throw new Error(`${provider.id} exceeded the tool-call limit.`);
  } catch (error) { return aiErrorResponse(error); }
}
