import { z } from "zod";
import { ruleInputSchema } from "@/domain/rule";
import { callApplicationTool, getToolDeclaration } from "@/lib/ai-tool-layer";
import { aiAllowanceHeaders, aiErrorResponse, enforceAiAllowance } from "@/lib/ai-http";
import { getLlmProvider, type LlmMessage } from "@/lib/llm/provider";
import { validateRuleTargets } from "@/lib/rules";

const SYSTEM_PROMPT = `You compile natural-language automation requests into one safe Physical Workspace rule.
You propose a rule only; you never save or execute it.
Never assume a database schema or invent sensor/device IDs. Inspect ontology, sensors, and devices through REST tools.
Return exactly one condition and one action. Preserve the user's language in name and description.`;

function normalizeProposal(value: unknown) {
  if (!value || typeof value !== "object") return value;
  const proposal = structuredClone(value) as { condition?: { value?: unknown; unit?: unknown }; action?: { value?: unknown } };
  if (proposal.condition) {
    const conditionValue = proposal.condition.value;
    if (proposal.condition.unit === "boolean" && typeof conditionValue === "string") {
      proposal.condition.value = ["true", "pressed", "on", "1", "yes"].includes(conditionValue.trim().toLowerCase());
    } else if (typeof conditionValue === "string" && conditionValue.trim() !== "") {
      proposal.condition.value = Number(conditionValue);
    }
  }
  if (proposal.action && typeof proposal.action.value === "string" && proposal.action.value.trim() !== "") {
    proposal.action.value = Number(proposal.action.value);
  }
  return proposal;
}

export async function POST(request: Request) {
  try {
    const { instruction } = z.object({ instruction: z.string().trim().min(3).max(500) }).parse(await request.json());
    const { allowance, response: limited } = await enforceAiAllowance(request);
    if (limited) return limited;
    const provider = getLlmProvider();
    const messages: LlmMessage[] = [{ role: "user", content: instruction }];
    const trace: string[] = [];

    for (const toolName of ["getOntology", "getSensors", "getDevices"]) {
      const result = await provider.generateWithTools({
        system: SYSTEM_PROMPT,
        messages,
        tools: [getToolDeclaration(toolName)],
        toolChoice: { mode: "any", allowedToolNames: [toolName] },
      });
      const call = result.toolCalls[0];
      if (!call?.name) throw new Error(`${provider.id} did not request ${toolName}.`);
      if (result.assistantMessage) messages.push(result.assistantMessage);
      trace.push(call.name);
      messages.push({ role: "user", toolResponses: [{ name: call.name, response: { result: await callApplicationTool(call.name) } }] });
    }

    const rawProposal = await provider.generateStructured({
      system: `${SYSTEM_PROMPT}
Return only valid JSON matching this TypeScript shape:
{
  "name": string,
  "description": string,
  "condition": { "sensorId": string, "operator": "gt" | "gte" | "lt" | "lte" | "eq", "value": number | boolean | string, "unit": "celsius" | "lux" | "centimeter" | "boolean" },
  "action": { "deviceId": string, "command": "on" | "off" | "set-angle" | "beep", "value"?: number },
  "enabled": boolean,
  "cooldownSeconds": number
}`,
      messages,
      schema: z.unknown(),
      schemaName: "RuleInput",
      temperature: 0.1,
    });
    const proposal = ruleInputSchema.parse(normalizeProposal(rawProposal));
    await validateRuleTargets(proposal);
    return Response.json({ proposal, trace, remaining: allowance.remaining }, { headers: aiAllowanceHeaders(allowance) });
  } catch (error) { return aiErrorResponse(error); }
}
