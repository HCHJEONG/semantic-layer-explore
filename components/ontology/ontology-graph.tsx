"use client";

import { useCallback, useMemo, useState } from "react";
import { Database, Network, RefreshCw } from "lucide-react";
import { Background, Controls, type Edge, Handle, MiniMap, type Node, Position, ReactFlow } from "@xyflow/react";
import type { Ontology } from "@/domain/ontology";
import { Button } from "@/components/ui/button";

const classColors: Record<string, string> = {
  Person: "#559ab3", Company: "#9f7ad0", Project: "#e19a55", Sensor: "#438da5",
  Event: "#d18a3f", Rule: "#8459ae", Device: "#3f9a68", Room: "#8a7d91",
  Class: "#42708d", Property: "#9b6b3d", Individual: "#5f7f58",
};

type GraphMode = "source" | "projection";
type ProjectionStatus = { status: string; rebuildId?: string; completedAt?: string; nodeCount: number; relationCount: number; errorMessage?: string };
type ProjectionNode = { id: string; kind: string; name: string; className?: string; externalId?: string };
type ProjectionGraph = { nodes: ProjectionNode[]; relations: Array<{ id: number; subjectId: string; predicate: string; objectId: string }> };
type NodeData = { label: string; kind: string; externalId?: string | null; className?: string; color: string };

function SemanticNode({ data }: { data: NodeData }) {
  return <div className="graph-node" style={{ borderLeft: `3px solid ${data.color}` }}><Handle type="target" position={Position.Left} /><span>{data.kind}</span><strong>{data.label}</strong>{(data.className || data.externalId) && <small>{data.className || data.externalId}</small>}<Handle type="source" position={Position.Right} /></div>;
}

const nodeTypes = { semantic: SemanticNode };

function sourceGraph(ontology: Ontology | null) {
  if (!ontology) return { nodes: [] as Node<NodeData>[], edges: [] as Edge[] };
  const depths = new Map(ontology.classes.map((item) => [item.name, 0]));
  for (let pass = 0; pass < ontology.classes.length; pass += 1) {
    for (const property of ontology.properties) {
      const nextDepth = Math.min((depths.get(property.domain) ?? 0) + 1, 4);
      if (nextDepth > (depths.get(property.range) ?? 0)) depths.set(property.range, nextDepth);
    }
  }
  const rowsByDepth = new Map<number, number>();
  const nodes: Node<NodeData>[] = ontology.individuals.map((item) => {
    const depth = depths.get(item.class) ?? 0;
    const row = rowsByDepth.get(depth) ?? 0;
    rowsByDepth.set(depth, row + 1);
    return { id: item.name, type: "semantic", position: { x: depth * 260, y: row * 105 }, data: { label: item.name, kind: item.class, className: item.class, externalId: item.externalId, color: classColors[item.class] ?? "#8a7d91" } };
  });
  const edges: Edge[] = ontology.relations.map((item) => ({ id: String(item.id), source: item.subject, target: item.object, label: item.predicate, animated: ["emits", "evaluatedBy", "triggers"].includes(item.predicate), style: { stroke: item.predicate === "triggers" ? "#8459ae" : "#9a8da1" }, labelStyle: { fill: "#655878", fontSize: 10, fontWeight: 600 } }));
  return { nodes, edges };
}

function projectionFlow(graph: ProjectionGraph | null) {
  if (!graph) return { nodes: [] as Node<NodeData>[], edges: [] as Edge[] };
  const layout = { Class: { x: 0, columns: 2 }, Property: { x: 390, columns: 2 }, Individual: { x: 780, columns: 3 } } as const;
  const indexes = new Map<string, number>();
  const nodes: Node<NodeData>[] = graph.nodes.map((item) => {
    const index = indexes.get(item.kind) ?? 0;
    indexes.set(item.kind, index + 1);
    const group = layout[item.kind as keyof typeof layout] ?? { x: 1170, columns: 2 };
    return { id: item.id, type: "semantic", position: { x: group.x + (index % group.columns) * 180, y: Math.floor(index / group.columns) * 100 }, data: { label: item.name, kind: item.kind, className: item.className, externalId: item.externalId, color: classColors[item.kind] ?? "#8a7d91" } };
  });
  const edges: Edge[] = graph.relations.map((item) => ({ id: `projection-${item.id}`, source: item.subjectId, target: item.objectId, label: item.predicate, animated: ["emits", "evaluatedBy", "triggers"].includes(item.predicate), style: { stroke: item.predicate === "triggers" ? "#8459ae" : "#78909c" }, labelStyle: { fill: "#526670", fontSize: 10, fontWeight: 600 } }));
  return { nodes, edges };
}

export function OntologyGraph({ ontology }: { ontology: Ontology | null }) {
  const [mode, setMode] = useState<GraphMode>("source");
  const [projection, setProjection] = useState<ProjectionGraph | null>(null);
  const [status, setStatus] = useState<ProjectionStatus | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadProjection = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const statusResponse = await fetch("/api/graph/projection/status", { cache: "no-store" });
      if (!statusResponse.ok) throw new Error("Neo4j graph profile is unavailable.");
      const nextStatus = await statusResponse.json() as ProjectionStatus;
      setStatus(nextStatus);
      if (nextStatus.status !== "ready") throw new Error(nextStatus.errorMessage || `Projection is ${nextStatus.status}.`);
      const graphResponse = await fetch("/api/graph/ontology", { cache: "no-store" });
      if (!graphResponse.ok) throw new Error("Neo4j projection could not be queried.");
      setProjection(await graphResponse.json() as ProjectionGraph);
    } catch (reason) { setProjection(null); setError(reason instanceof Error ? reason.message : "Neo4j projection is unavailable."); }
    finally { setLoading(false); }
  }, []);

  function changeMode(nextMode: GraphMode) {
    setMode(nextMode); setSelectedId(null);
    if (nextMode === "projection" && !projection && !loading) void loadProjection();
  }

  async function rebuildProjection() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/graph/projection/rebuild", { method: "POST" });
      if (!response.ok) throw new Error("Neo4j rebuild could not be queued.");
      setStatus({ status: "running", nodeCount: status?.nodeCount ?? 0, relationCount: status?.relationCount ?? 0 });
      window.setTimeout(() => void loadProjection(), 1200);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Neo4j rebuild failed."); setLoading(false); }
  }

  const source = useMemo(() => sourceGraph(ontology), [ontology]);
  const projected = useMemo(() => projectionFlow(projection), [projection]);
  const graph = mode === "source" ? source : projected;
  const selected = graph.nodes.find((node) => node.id === selectedId);
  const countLabel = mode === "source" ? `${source.nodes.length} individuals · ${source.edges.length} relations` : status ? `${status.nodeCount} nodes · ${status.relationCount} relations` : "Projection not loaded";

  return <section className="graph panel">
    <div className="graph-head">
      <div><span>GRAPH VIEW</span><h2>{mode === "source" ? "Authoritative ontology" : "Neo4j projection"}</h2></div>
      <div className="graph-toolbar">
        <div className="graph-mode-switch" role="group" aria-label="Graph data source">
          <button type="button" aria-pressed={mode === "source"} onClick={() => changeMode("source")}><Database />Source</button>
          <button type="button" aria-pressed={mode === "projection"} onClick={() => changeMode("projection")}><Network />Projection</button>
        </div>
        {mode === "projection" && <Button variant="outline" size="icon-sm" onClick={() => void rebuildProjection()} disabled={loading || status?.status === "running"} title="Rebuild Neo4j projection"><RefreshCw className={loading ? "spin" : ""} /><span className="sr-only">Rebuild Neo4j projection</span></Button>}
      </div>
    </div>
    <div className="graph-context"><span>{mode === "source" ? "PostgreSQL source" : status?.status ?? "offline"}</span><strong>{countLabel}</strong>{mode === "projection" && status?.completedAt && <small>Updated {new Date(status.completedAt).toLocaleString()}</small>}</div>
    <div className="flow">
      {mode === "projection" && (loading || error) && <div className="graph-overlay"><Network />{loading ? "Loading Neo4j projection" : error}<small>{error ? "Start the graph profile or request a rebuild when it is available." : "Reading the bounded Go graph query"}</small></div>}
      <ReactFlow nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.12, maxZoom: 0.9 }} minZoom={0.25} proOptions={{ hideAttribution: true }} onNodeClick={(_, node) => setSelectedId(node.id)}><Background color="#ddd6e8" gap={24} /><MiniMap pannable zoomable /><Controls /></ReactFlow>
    </div>
    <div className="graph-detail" aria-live="polite">
      {selected ? <><span>{selected.data.kind}</span><strong>{selected.data.label}</strong><small>{selected.id}{selected.data.className ? ` · ${selected.data.className}` : ""}{selected.data.externalId ? ` · ${selected.data.externalId}` : ""}</small></> : <><span>{mode === "source" ? "SOURCE OF TRUTH" : "READ MODEL"}</span><strong>{mode === "source" ? "Select an individual to inspect it" : "Select a projected node to inspect it"}</strong><small>{mode === "source" ? "PostgreSQL ontology DTO" : "Bounded Neo4j query through Go"}</small></>}
    </div>
  </section>;
}
