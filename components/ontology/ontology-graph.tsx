"use client";

import { useMemo } from "react";
import { Background, Controls, type Edge, Handle, MiniMap, type Node, Position, ReactFlow } from "@xyflow/react";
import type { Ontology } from "@/domain/ontology";

const classColors: Record<string, string> = {
  Person: "#559ab3", Company: "#9f7ad0", Project: "#e19a55", Sensor: "#438da5",
  Event: "#d18a3f", Rule: "#8459ae", Device: "#3f9a68", Room: "#8a7d91",
};

function SemanticNode({ data }: { data: { label: string; kind: string; externalId?: string | null; color: string } }) {
  return <div className="graph-node" style={{ borderLeft: `3px solid ${data.color}` }}><Handle type="target" position={Position.Left} /><span>{data.kind}</span><strong>{data.label}</strong>{data.externalId && <small>{data.externalId}</small>}<Handle type="source" position={Position.Right} /></div>;
}

const nodeTypes = { semantic: SemanticNode };

export function OntologyGraph({ ontology }: { ontology: Ontology | null }) {
  const graph = useMemo(() => {
    if (!ontology) return { nodes: [], edges: [] };
    const depths = new Map(ontology.classes.map((item) => [item.name, 0]));
    for (let pass = 0; pass < ontology.classes.length; pass += 1) {
      for (const property of ontology.properties) {
        const nextDepth = Math.min((depths.get(property.domain) ?? 0) + 1, 4);
        if (nextDepth > (depths.get(property.range) ?? 0)) depths.set(property.range, nextDepth);
      }
    }
    const rowsByDepth = new Map<number, number>();
    const nodes: Node[] = ontology.individuals.map((item) => {
      const depth = depths.get(item.class) ?? 0;
      const row = rowsByDepth.get(depth) ?? 0;
      rowsByDepth.set(depth, row + 1);
      return { id: item.name, type: "semantic", position: { x: depth * 260, y: row * 105 }, data: {
        label: item.name, kind: item.class, externalId: item.externalId, color: classColors[item.class] ?? "#8a7d91",
      } };
    });
    const edges: Edge[] = ontology.relations.map((item) => ({
      id: String(item.id), source: item.subject, target: item.object, label: item.property,
      animated: ["emits", "evaluatedBy", "triggers"].includes(item.property),
      style: { stroke: item.property === "triggers" ? "#8459ae" : "#9a8da1" },
      labelStyle: { fill: "#655878", fontSize: 10, fontWeight: 600 },
    }));
    return { nodes, edges };
  }, [ontology]);

  return <section className="graph panel">
    <div className="graph-head"><div><span>GRAPH VIEW</span><h2>Runtime meaning at a glance</h2></div><div className="legend">{ontology?.classes.map((item) => <span key={item.id}><i style={{ background: classColors[item.name] ?? "#8a7d91" }} /> {item.name}</span>)}</div></div>
    <div className="flow"><ReactFlow nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes} fitView proOptions={{ hideAttribution: true }}><Background color="#ddd6e8" gap={24} /><MiniMap pannable zoomable /><Controls /></ReactFlow></div>
  </section>;
}
