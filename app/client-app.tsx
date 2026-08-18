"use client";

import { useEffect, useState } from "react";
import "@xyflow/react/dist/style.css";
import { AskAi } from "@/components/ai/ask-ai";
import { WorkspaceDashboard } from "@/components/dashboard/workspace-dashboard";
import { RuleStudio } from "@/components/rules/rule-studio";
import { JsonViewer } from "@/components/ontology/json-viewer";
import { ObjectDetail } from "@/components/ontology/object-detail";
import { OntologyGraph } from "@/components/ontology/ontology-graph";
import { OntologyTree } from "@/components/ontology/ontology-tree";
import { AppShell, type AppTab } from "@/components/shell/app-shell";
import type { Ontology, OntologyItem, OntologyKind, OntologySelection } from "@/domain/ontology";

export type ExplainContext = { mode: "explain"; eventId: string; requestedAt: number };

export default function ClientApp() {
  const [ontology, setOntology] = useState<Ontology | null>(null);
  const [selection, setSelection] = useState<OntologySelection | null>(null);
  const [tab, setTab] = useState<AppTab>("dashboard");
  const [explainContext, setExplainContext] = useState<ExplainContext | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/ontology")
      .then(async (response) => {
        if (!response.ok) throw new Error("The semantic layer is unavailable.");
        return response.json() as Promise<Ontology>;
      })
      .then((result) => {
        setOntology(result);
        if (result.individuals[0]) setSelection({ kind: "Individual", item: result.individuals[0] });
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "The semantic layer is unavailable."));
  }, []);

  function selectOntologyItem(kind: OntologyKind, item: OntologyItem) {
    setSelection({ kind, item });
  }

  function explainEvent(eventId: string) {
    setExplainContext((current) => ({ mode: "explain", eventId, requestedAt: (current?.requestedAt ?? 0) + 1 }));
    setTab("ai");
  }

  return <AppShell tab={tab} onTabChange={setTab}>
    {renderTabContent(tab, { ontology, selection, error, explainContext, onExplainEvent: explainEvent, onSelect: selectOntologyItem, onBackToWorkspace: () => setTab("dashboard") })}
  </AppShell>;
}

function renderTabContent(
  tab: AppTab,
  explorerProps: {
    ontology: Ontology | null;
    selection: OntologySelection | null;
    error: string;
    explainContext: ExplainContext | null;
    onExplainEvent: (eventId: string) => void;
    onSelect: (kind: OntologyKind, item: OntologyItem) => void;
    onBackToWorkspace: () => void;
  },
) {
  switch (tab) {
    case "dashboard":
      return <WorkspaceDashboard onExplainEvent={explorerProps.onExplainEvent} />;
    case "rules":
      return <RuleStudio />;
    case "explorer":
      return <OntologyExplorer {...explorerProps} />;
    case "ai":
      return <AskAi explainContext={explorerProps.explainContext} onBackToWorkspace={explorerProps.onBackToWorkspace} />;
  }
}

function OntologyExplorer({
  ontology,
  selection,
  error,
  onSelect,
}: {
  ontology: Ontology | null;
  selection: OntologySelection | null;
  error: string;
  onSelect: (kind: OntologyKind, item: OntologyItem) => void;
}) {
  return <>
    <section className="workspace">
      <OntologyTree ontology={ontology} selection={selection} loading={!ontology && !error} onSelect={onSelect} />
      <ObjectDetail selection={selection} />
      <JsonViewer ontology={ontology} selection={selection} />
    </section>
    <OntologyGraph ontology={ontology} />
    {error && <div className="error toast">{error}</div>}
  </>;
}
