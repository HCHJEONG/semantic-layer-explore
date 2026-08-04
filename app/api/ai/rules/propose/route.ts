import { Type } from "@google/genai";
import { z } from "zod";
import { ruleInputSchema } from "@/domain/rule";
import { callApplicationTool, getToolDeclaration } from "@/lib/ai-tool-layer";
import { aiErrorResponse, aiResponseHeaders, enforceAiAllowance } from "@/lib/ai-http";
import { getGeminiClient, getGeminiModel } from "@/lib/gemini";
import { validateRuleTargets } from "@/lib/rules";

const SYSTEM_PROMPT = `You compile natural-language automation requests into one safe Physical Workspace rule.
You propose a rule only; you never save or execute it.
Never assume a database schema or invent sensor/device IDs. Inspect ontology, sensors, and devices through REST tools.
Return exactly one condition and one action. Preserve the user's language in name and description.`;

const responseSchema = {
  type: Type.OBJECT,
  required: ["name", "description", "condition", "action", "enabled", "cooldownSeconds"],
  properties: {
    name: { type: Type.STRING }, description: { type: Type.STRING }, enabled: { type: Type.BOOLEAN }, cooldownSeconds: { type: Type.INTEGER },
    condition: { type: Type.OBJECT, required: ["sensorId", "operator", "value", "unit"], properties: {
      sensorId: { type: Type.STRING }, operator: { type: Type.STRING, enum: ["gt", "gte", "lt", "lte", "eq"] },
      value: { anyOf: [{ type: Type.NUMBER }, { type: Type.BOOLEAN }] }, unit: { type: Type.STRING, enum: ["celsius", "lux", "centimeter", "boolean"] },
    } },
    action: { type: Type.OBJECT, required: ["deviceId", "command"], properties: {
      deviceId: { type: Type.STRING }, command: { type: Type.STRING, enum: ["on", "off", "set-angle", "beep"] }, value: { type: Type.NUMBER },
    } },
  },
};

export async function POST(request: Request) {
  try {
    const { instruction } = z.object({ instruction: z.string().trim().min(3).max(500) }).parse(await request.json());
    const { allowance, response: limited } = await enforceAiAllowance(request);
    if (limited) return limited;
    const ai = getGeminiClient();
    const contents: Array<Record<string, unknown>> = [{ role: "user", parts: [{ text: instruction }] }];
    const trace: string[] = [];

    for (const toolName of ["getOntology", "getSensors", "getDevices"]) {
      const result = await ai.models.generateContent({
        model: getGeminiModel(), contents: contents as never,
        config: {
          systemInstruction: SYSTEM_PROMPT, tools: [{ functionDeclarations: [getToolDeclaration(toolName)] }],
          toolConfig: { functionCallingConfig: { mode: "ANY" as never, allowedFunctionNames: [toolName] } },
        },
      });
      const call = result.functionCalls?.[0];
      if (!call?.name) throw new Error(`Gemini did not request ${toolName}.`);
      const modelContent = result.candidates?.[0]?.content;
      if (modelContent) contents.push(modelContent as unknown as Record<string, unknown>);
      trace.push(call.name);
      contents.push({ role: "user", parts: [{ functionResponse: { name: call.name, response: { result: await callApplicationTool(call.name, request.url) } } }] });
    }

    const result = await ai.models.generateContent({
      model: getGeminiModel(), contents: contents as never,
      config: { systemInstruction: SYSTEM_PROMPT, responseMimeType: "application/json", responseSchema },
    });
    const proposal = ruleInputSchema.parse(JSON.parse(result.text || "{}"));
    validateRuleTargets(proposal);
    return Response.json({ proposal, trace, remaining: allowance.remaining }, { headers: aiResponseHeaders(allowance.remaining) });
  } catch (error) { return aiErrorResponse(error); }
}
