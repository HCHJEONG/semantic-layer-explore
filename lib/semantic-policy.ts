import type { Ontology } from "@/domain/ontology";

export type SemanticAction = "rule.approve" | "rule.toggle" | "rule.delete" | "copilot.query";

export type SemanticPolicy = {
  action: SemanticAction;
  title: string;
  requiredIndividual: string;
  requiredRelation: { subject: string; property: string; object: string };
  prompt: string;
};

export type SemanticPolicyCheck = {
  policy: SemanticPolicy;
  individualFound: boolean;
  relationFound: boolean;
  steps: string[];
};

export const semanticPolicies: Record<SemanticAction, SemanticPolicy> = {
  "rule.approve": {
    action: "rule.approve",
    title: "Automation approval",
    requiredIndividual: "OpsEngineer",
    requiredRelation: { subject: "OpsEngineer", property: "assignedTo", object: "BestAiCom Smart Workspace" },
    prompt: "Ontology confirms OpsEngineer is assigned to BestAiCom Smart Workspace. Continue as OpsEngineer?",
  },
  "rule.toggle": {
    action: "rule.toggle",
    title: "Automation state change",
    requiredIndividual: "OpsEngineer",
    requiredRelation: { subject: "OpsEngineer", property: "assignedTo", object: "BestAiCom Smart Workspace" },
    prompt: "Ontology confirms OpsEngineer is assigned to BestAiCom Smart Workspace. Continue as OpsEngineer?",
  },
  "rule.delete": {
    action: "rule.delete",
    title: "Automation removal",
    requiredIndividual: "OpsEngineer",
    requiredRelation: { subject: "OpsEngineer", property: "assignedTo", object: "BestAiCom Smart Workspace" },
    prompt: "Ontology confirms OpsEngineer is assigned to BestAiCom Smart Workspace. Continue as OpsEngineer?",
  },
  "copilot.query": {
    action: "copilot.query",
    title: "Operational context query",
    requiredIndividual: "InspectionTeam",
    requiredRelation: { subject: "InspectionTeam", property: "worksFor", object: "BestAiCom" },
    prompt: "Ontology confirms InspectionTeam works for BestAiCom. Continue as InspectionTeam?",
  },
};

export async function loadOntologyPolicyCheck(action: SemanticAction): Promise<SemanticPolicyCheck> {
  const policy = semanticPolicies[action];
  const response = await fetch("/api/ontology", { cache: "no-store" });
  if (!response.ok) throw new Error("Semantic role policy could not read the ontology.");

  const ontology = await response.json() as Ontology;
  const individualFound = ontology.individuals.some((item) => item.name === policy.requiredIndividual);
  const relationFound = ontology.relations.some((item) =>
    item.subject === policy.requiredRelation.subject &&
    item.property === policy.requiredRelation.property &&
    item.object === policy.requiredRelation.object
  );

  return {
    policy,
    individualFound,
    relationFound,
    steps: [
      `Loaded ontology: ${ontology.individuals.length} individuals, ${ontology.relations.length} relations`,
      `${individualFound ? "Found" : "Missing"} required individual: ${policy.requiredIndividual}`,
      `${relationFound ? "Found" : "Missing"} required relation: ${policy.requiredRelation.subject} ${policy.requiredRelation.property} ${policy.requiredRelation.object}`,
    ],
  };
}

export async function confirmSemanticPolicy(action: SemanticAction): Promise<SemanticPolicyCheck | null> {
  const check = await loadOntologyPolicyCheck(action);
  if (!check.individualFound || !check.relationFound) {
    throw new Error(`Semantic role policy failed: ${check.steps.join(" / ")}`);
  }

  return window.confirm(check.policy.prompt) ? check : null;
}
