"use client";

import { useMemo } from "react";
import { Background, Controls, type Edge, Handle, MiniMap, type Node, Position, ReactFlow } from "@xyflow/react";
import type { Ontology } from "@/domain/ontology";

function SemanticNode({ data }: { data: { label: string; kind: string } }) {
  return <div className={`graph-node ${data.kind.toLowerCase()}`}><Handle type="target" position={Position.Left} /><span>{data.kind}</span><strong>{data.label}</strong><Handle type="source" position={Position.Right} /></div>;
}

const nodeTypes = { semantic: SemanticNode };

export function OntologyGraph({ ontology }: { ontology: Ontology | null }) {
  const graph = useMemo(() => {
    if (!ontology) return { nodes: [], edges: [] };
    const positions: Record<string, { x: number; y: number }> = {
      Alice: { x: 20, y: 20 }, Bob: { x: 20, y: 145 }, OpenAI: { x: 360, y: 40 }, "Semantic Explorer": { x: 360, y: 180 },
    };
    const nodes: Node[] = ontology.individuals.map((item, index) => ({ id: item.name, type: "semantic", position: positions[item.name] ?? { x: 180 * index, y: 100 }, data: { label: item.name, kind: item.class } }));
    const edges: Edge[] = ontology.relations.map((item) => ({ id: String(item.id), source: item.subject, target: item.object, label: item.property, animated: item.property === "worksFor", style: { stroke: "#8b5cf6" }, labelStyle: { fill: "#655878", fontSize: 11, fontWeight: 600 } }));
    return { nodes, edges };
  }, [ontology]);

  return <section className="graph panel">
    <div className="graph-head"><div><span>GRAPH VIEW</span><h2>Relationships at a glance</h2></div><div className="legend"><span><i className="person" /> Person</span><span><i className="company" /> Company</span><span><i className="project" /> Project</span></div></div>
    <div className="flow"><ReactFlow nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes} fitView proOptions={{ hideAttribution: true }}><Background color="#ddd6e8" gap={24} /><MiniMap pannable zoomable /><Controls /></ReactFlow></div>
  </section>;
}
