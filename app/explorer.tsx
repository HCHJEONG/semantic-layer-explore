"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Background, Controls, Edge, Handle, MiniMap, Node, Position, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowRight, Bot, Box, Braces, CircleDot, Database, Network, Search, Send, Sparkles, UserRound } from "lucide-react";

type ClassItem = { id: number; name: string; description: string };
type PropertyItem = { id: number; name: string; description: string; domain: string; range: string };
type IndividualItem = { id: number; name: string; description: string; class: string };
type RelationItem = { id: number; subject: string; property: string; object: string };
type Ontology = { classes: ClassItem[]; properties: PropertyItem[]; individuals: IndividualItem[]; relations: RelationItem[] };
type Selection = { kind: "Class" | "Property" | "Individual"; item: ClassItem | PropertyItem | IndividualItem };

const examples = ["Where does Alice work?", "Who works for OpenAI?", "What projects is Bob assigned to?", "Show all people."];

function GraphNode({ data }: { data: { label: string; kind: string } }) {
  return <div className={`graph-node ${data.kind.toLowerCase()}`}><Handle type="target" position={Position.Left} /><span>{data.kind}</span><strong>{data.label}</strong><Handle type="source" position={Position.Right} /></div>;
}

const nodeTypes = { semantic: GraphNode };

export default function Explorer() {
  const [data, setData] = useState<Ontology | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [tab, setTab] = useState<"explorer" | "ai">("explorer");
  const [question, setQuestion] = useState(examples[0]);
  const [answer, setAnswer] = useState("");
  const [trace, setTrace] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/ontology").then(async (response) => {
      if (!response.ok) throw new Error("The semantic layer is unavailable.");
      return response.json();
    }).then((ontology: Ontology) => {
      setData(ontology); setSelection({ kind: "Individual", item: ontology.individuals[0] });
    }).catch((reason) => setError(reason.message));
  }, []);

  const graph = useMemo(() => {
    if (!data) return { nodes: [], edges: [] };
    const positions: Record<string, { x: number; y: number }> = {
      Alice: { x: 20, y: 20 }, Bob: { x: 20, y: 145 }, OpenAI: { x: 360, y: 40 }, "Semantic Explorer": { x: 360, y: 180 },
    };
    const nodes: Node[] = data.individuals.map((item, index) => ({ id: item.name, type: "semantic", position: positions[item.name] ?? { x: 180 * index, y: 100 }, data: { label: item.name, kind: item.class } }));
    const edges: Edge[] = data.relations.map((item) => ({ id: String(item.id), source: item.subject, target: item.object, label: item.property, animated: item.property === "worksFor", style: { stroke: "#8b5cf6" }, labelStyle: { fill: "#655878", fontSize: 11, fontWeight: 600 } }));
    return { nodes, edges };
  }, [data]);

  const ask = useCallback(async () => {
    if (!question.trim() || loading) return;
    setLoading(true); setAnswer(""); setTrace([]); setError("");
    try {
      const response = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gemini could not answer.");
      setAnswer(result.answer); setTrace(result.trace || []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to answer"); }
    finally { setLoading(false); }
  }, [question, loading]);

  const sections = data ? [
    { title: "Classes", icon: Box, kind: "Class" as const, items: data.classes },
    { title: "Properties", icon: CircleDot, kind: "Property" as const, items: data.properties },
    { title: "Individuals", icon: UserRound, kind: "Individual" as const, items: data.individuals },
  ] : [];

  return <main>
    <header className="topbar">
      <div className="brand"><div className="brandmark"><Network size={18} /></div><div><strong>Semantic Layer</strong><span>Explorer</span></div></div>
      <nav aria-label="Primary navigation">
        <button className={tab === "explorer" ? "active" : ""} onClick={() => setTab("explorer")}><Braces size={15} /> Explorer</button>
        <button className={tab === "ai" ? "active" : ""} onClick={() => setTab("ai")}><Sparkles size={15} /> Ask AI</button>
      </nav>
      <div className="status"><i /> SQLite connected</div>
    </header>

    {tab === "explorer" ? <>
      <section className="workspace">
        <aside className="sidebar panel">
          <div className="panel-title"><div><span>ONTOLOGY</span><h2>Explorer</h2></div><Search size={17} /></div>
          {!data && !error && <div className="loading-lines">Loading semantic layer…</div>}
          {sections.map((section) => <div className="tree-section" key={section.title}>
            <h3><section.icon size={14} /> {section.title}<b>{section.items.length}</b></h3>
            {section.items.map((item) => <button key={item.id} className={selection?.kind === section.kind && selection.item.id === item.id ? "selected" : ""} onClick={() => setSelection({ kind: section.kind, item })}><span className={`dot ${section.kind.toLowerCase()}`} />{item.name}</button>)}
          </div>)}
        </aside>

        <section className="detail panel">
          <div className="eyebrow">SELECTED OBJECT</div>
          {selection ? <>
            <div className="object-heading"><div className={`object-icon ${selection.kind.toLowerCase()}`}>{selection.kind === "Class" ? <Box /> : selection.kind === "Property" ? <CircleDot /> : <UserRound />}</div><div><span>{selection.kind}</span><h1>{selection.item.name}</h1></div></div>
            <p className="description">{selection.item.description}</p>
            <div className="field-grid"><label>Identifier<strong>{selection.item.id}</strong></label><label>Semantic type<strong>{selection.kind}</strong></label>
              {"class" in selection.item && <label>Instance of<strong>{selection.item.class}</strong></label>}
              {"domain" in selection.item && <><label>Domain<strong>{selection.item.domain}</strong></label><label>Range<strong>{selection.item.range}</strong></label></>}
            </div>
            <div className="meaning"><Sparkles size={16} /><div><b>Semantic meaning</b><p>{selection.kind === "Property" ? `${selection.item.name} connects ${selection.item.domain} to ${selection.item.range}.` : selection.kind === "Individual" ? `${selection.item.name} is a concrete instance of ${selection.item.class}.` : `${selection.item.name} defines a reusable business concept.`}</p></div></div>
          </> : <div className="empty">Choose an ontology object to inspect it.</div>}
        </section>

        <aside className="json panel">
          <div className="json-head"><div><Braces size={15} /><span>RAW JSON</span></div><b>/api/ontology</b></div>
          <pre>{JSON.stringify(selection ? selection.item : data, null, 2)}</pre>
          <div className="json-foot"><i /> Live API response</div>
        </aside>
      </section>

      <section className="graph panel">
        <div className="graph-head"><div><span>GRAPH VIEW</span><h2>Relationships at a glance</h2></div><div className="legend"><span><i className="person" /> Person</span><span><i className="company" /> Company</span><span><i className="project" /> Project</span></div></div>
        <div className="flow"><ReactFlow nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes} fitView proOptions={{ hideAttribution: true }}><Background color="#ddd6e8" gap={24} /><MiniMap pannable zoomable /><Controls /></ReactFlow></div>
      </section>
    </> : <section className="ai-page">
      <div className="ai-intro"><div className="ai-orb"><Bot size={28} /></div><div className="eyebrow">ONTOLOGY-AWARE ASSISTANT</div><h1>Ask the semantic layer.</h1><p>Gemini inspects business meaning first, then calls only the REST APIs it needs. It never touches SQLite directly.</p></div>
      <div className="ask-card panel">
        <label htmlFor="question">Your question</label>
        <div className="ask-row"><input id="question" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => event.key === "Enter" && ask()} placeholder="Ask about people, companies, or projects…" /><button onClick={ask} disabled={loading}>{loading ? "Thinking…" : <><span>Ask</span><Send size={16} /></>}</button></div>
        <div className="examples">{examples.map((example) => <button key={example} onClick={() => setQuestion(example)}>{example}</button>)}</div>
      </div>
      {(answer || loading) && <div className="answer-card panel"><div className="answer-label"><Sparkles size={15} /> ANSWER</div>{loading ? <div className="thinking"><i /><i /><i /> Reading the ontology</div> : <p>{answer}</p>}{trace.length > 0 && <div className="trace">{trace.map((step, index) => <span key={`${step}-${index}`}>{step}{index < trace.length - 1 && <ArrowRight size={12} />}</span>)}</div>}</div>}
      {error && <div className="error">{error}</div>}
      <div className="pipeline"><span><Bot />Gemini</span><ArrowRight/><span><Network />Semantic Layer</span><ArrowRight/><span><Braces />REST API</span><ArrowRight/><span><Database />SQLite</span></div>
    </section>}
    {error && tab === "explorer" && <div className="error toast">{error}</div>}
  </main>;
}
