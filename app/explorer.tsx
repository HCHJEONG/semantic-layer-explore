"use client";

import { useEffect, useState } from "react";
import "@xyflow/react/dist/style.css";
import { AskAi } from "@/components/ai/ask-ai";
import { WorkspaceDashboard } from "@/components/dashboard/workspace-dashboard";
import { JsonViewer } from "@/components/ontology/json-viewer";
import { ObjectDetail } from "@/components/ontology/object-detail";
import { OntologyGraph } from "@/components/ontology/ontology-graph";
import { OntologyTree } from "@/components/ontology/ontology-tree";
import { AppShell, type AppTab } from "@/components/shell/app-shell";
import type { Ontology, OntologyItem, OntologyKind, OntologySelection } from "@/domain/ontology";

export default function Explorer() {
  const [ontology, setOntology] = useState<Ontology | null>(null);
  const [selection, setSelection] = useState<OntologySelection | null>(null);
  const [tab, setTab] = useState<AppTab>("dashboard");
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

  return <AppShell tab={tab} onTabChange={setTab}>
    {tab === "dashboard" ? <WorkspaceDashboard /> : tab === "explorer" ? <>
      <section className="workspace">
        <OntologyTree ontology={ontology} selection={selection} loading={!ontology && !error} onSelect={selectOntologyItem} />
        <ObjectDetail selection={selection} />
        <JsonViewer ontology={ontology} selection={selection} />
      </section>
      <OntologyGraph ontology={ontology} />
      {error && <div className="error toast">{error}</div>}
    </> : <AskAi />}
  </AppShell>;
}
