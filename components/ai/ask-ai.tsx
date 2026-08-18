"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Background, type Edge, Handle, type Node, Position, ReactFlow } from "@xyflow/react";
import { ArrowRight, Bot, Braces, CheckCircle2, Database, GitBranch, Network, Send, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { ExplainContext } from "@/app/client-app";
import { loadOntologyPolicyCheck } from "@/lib/semantic-policy";

const examples = ["현재 운영 상태 요약해줘.", "어떤 자동화가 방금 실행됐어?", "주의해야 할 센서 변화가 있어?", "Which assets need attention right now?"];

type ExplainResult = {
  eventId: string;
  explainable: boolean;
  completeness: "complete" | "partial" | "insufficient";
  title: string;
  summary: string;
  missing: string[];
  workflow?: { engine: string; stages: Array<{ id: string; label: string; status: "completed" }> };
  agentFindings?: Record<string, { findings: Array<{ claim: string; evidenceIds: string[]; support: "proven" | "derived" | "insufficient" }>; uncertainties: string[] }>;
  critic?: { verifiedClaims: Array<{ claim: string; support: string }>; rejectedClaims: Array<{ claim: string; support: string }>; uncertainties: string[] };
  evidence: Array<{ id: string; label: string; support: "proven" | "derived" | "insufficient"; eventId?: string; eventType?: string; detail: string }>;
  causalSteps: Array<{ type: "sensor" | "rule" | "execution"; label: string; detail: string; evidenceId?: string; support: "proven" | "derived" | "insufficient" }>;
};

export function AskAi({ explainContext, onBackToWorkspace }: { explainContext: ExplainContext | null; onBackToWorkspace: () => void }) {
  const [question, setQuestion] = useState(examples[0]);
  const [answer, setAnswer] = useState("");
  const [trace, setTrace] = useState<string[]>([]);
  const [semanticTrace, setSemanticTrace] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainResult, setExplainResult] = useState<ExplainResult | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!explainContext) return;
    let cancelled = false;
    const { eventId } = explainContext;
    async function explain() {
      setExplainLoading(true); setExplainResult(null); setAnswer(""); setTrace([]); setError("");
      try {
        const response = await fetch("/api/ai/explain-event", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ eventId }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not explain the selected event.");
        if (!cancelled) setExplainResult(result);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not explain the selected event.");
      } finally {
        if (!cancelled) setExplainLoading(false);
      }
    }
    void explain();
    return () => { cancelled = true; };
  }, [explainContext]);

  const confirmInspectionTeamQuery = useCallback(async () => {
    setSemanticTrace(["Starting semantic role policy check…"]);
    const check = await loadOntologyPolicyCheck("copilot.query");
    setSemanticTrace([check.policy.title, ...check.steps]);
    if (!check.individualFound || !check.relationFound) throw new Error(`Semantic role policy failed: ${check.steps.join(" / ")}`);
    const confirmed = window.confirm(check.policy.prompt);
    setSemanticTrace((current) => [...current, confirmed ? `User confirmed ${check.policy.requiredIndividual}.` : `User cancelled ${check.policy.requiredIndividual} confirmation.`]);
    return confirmed;
  }, []);

  const ask = useCallback(async () => {
    if (!question.trim() || loading) return;
    setLoading(true); setAnswer(""); setTrace([]); setError("");
    try {
      const approved = await confirmInspectionTeamQuery();
      if (!approved) return;
      const response = await fetch("/api/ai/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "BestAiCom AI could not answer.");
      setAnswer(result.answer); setTrace(result.trace || []); setRemaining(result.remaining ?? null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to answer");
    } finally {
      setLoading(false);
    }
  }, [confirmInspectionTeamQuery, question, loading]);

  const explainMode = Boolean(explainContext);

  return <section className="ai-page">
    <div className="ai-intro"><div className="ai-orb"><Bot size={28} /></div><div className="eyebrow">BESTAICOM OPS ANALYST</div><h1>Ask what changed, why it happened, and what is active.</h1><p>BestAiCom AI reads the semantic map first, then explains current state, approved rules, and recent events using auditable application data.</p></div>
    {explainMode && <Card className="answer-card explain-card">
      <CardContent className="p-6">
        <div className="answer-label"><Sparkles size={15} /> ASK AI · EXPLAIN MODE <b>Source event {explainContext?.eventId}</b></div>
        <Button variant="outline" size="sm" onClick={onBackToWorkspace}>Back to Workspace</Button>
        {explainLoading && <div className="thinking explain-thinking"><Skeleton className="h-4 w-32" /><i /><i /><i /> Building causal trace</div>}
        {explainResult && <ExplainResultView result={explainResult} />}
      </CardContent>
    </Card>}
    <Card className="ask-card">
      <CardContent className="p-6">
        <Label htmlFor="question">Your question</Label>
        <div className="ask-row">
          <Input id="question" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => event.key === "Enter" && ask()} placeholder="Ask about sensors, devices, rules, or recent events…" />
          <Button onClick={ask} disabled={loading}>{loading ? "Analyzing…" : <><span>Ask BestAiCom AI</span><Send size={16} /></>}</Button>
        </div>
        <div className="examples">{examples.map((example) => <Button key={example} variant="outline" size="sm" onClick={() => setQuestion(example)}>{example}</Button>)}</div>
        {semanticTrace.length > 0 && <SemanticPolicyTrace steps={semanticTrace} />}
      </CardContent>
    </Card>
    {(answer || loading) && <Card className="answer-card">
      <CardContent className="p-6">
        <div className="answer-label"><Sparkles size={15} /> ANSWER {remaining !== null && <b>{remaining} questions left today</b>}</div>
        {loading ? <div className="thinking"><Skeleton className="h-4 w-24" /><i /><i /><i /> Reading the semantic map</div> : <div className="answer-markdown"><ReactMarkdown>{answer}</ReactMarkdown></div>}
        {trace.length > 0 && <div className="trace">{trace.map((step, index) => <span key={`${step}-${index}`}>{step}{index < trace.length - 1 && <ArrowRight size={12} />}</span>)}</div>}
      </CardContent>
    </Card>}
    {error && <div className="error">{error}</div>}
    <div className="pipeline"><span><Bot />BestAiCom AI</span><ArrowRight/><span><Network />Semantic Map</span><ArrowRight/><span><Braces />Application APIs</span><ArrowRight/><span><Database />Operational Store</span></div>
  </section>;
}

function ExplainResultView({ result }: { result: ExplainResult }) {
  return <div className="explain-result">
    <h2>{result.title}</h2>
    <p>{result.summary}</p>
    <div className={`explain-status ${result.completeness}`}>{result.completeness.toUpperCase()}</div>
    {result.workflow && <WorkflowGraph result={result} />}
    {result.workflow && <div className="workflow-stages">
      <strong>Workflow</strong>
      <small>{result.workflow.engine}</small>
      {result.workflow.stages.map((stage) => <span key={stage.id}><CheckCircle2 size={13} />{stage.label}</span>)}
    </div>}
    {result.causalSteps.length > 0 && <div className="causal-steps">
      {result.causalSteps.map((step, index) => <span key={`${step.type}-${step.label}-${index}`}>
        <strong>{step.label}</strong>
        <small>{step.detail} · {step.support}</small>
        {index < result.causalSteps.length - 1 && <ArrowRight size={13} />}
      </span>)}
    </div>}
    {result.missing.length > 0 && <div className="explain-missing"><strong>Missing evidence</strong>{result.missing.map((item) => <span key={item}>{item}</span>)}</div>}
    {result.agentFindings && <div className="agent-findings">
      <strong>Prepared Agent Findings</strong>
      {Object.entries(result.agentFindings).map(([agent, review]) => <article key={agent}>
        <b>{agent}</b>
        {review.findings.map((item) => <span key={`${agent}-${item.claim}`}>{item.claim} · {item.support}</span>)}
        {review.uncertainties.map((item) => <small key={`${agent}-${item}`}>{item}</small>)}
      </article>)}
    </div>}
    <div className="evidence-list">
      <strong>Evidence Review</strong>
      {result.evidence.map((item) => <article key={item.id}>
        <CheckCircle2 size={14} />
        <div><b>{item.label}</b><span>{item.detail}</span><small>{item.support}{item.eventId ? ` · ${item.eventId}` : ""}</small></div>
      </article>)}
    </div>
    {result.critic && <div className="critic-review">
      <strong>Critic / Verifier</strong>
      <span>{result.critic.verifiedClaims.length} verified claims</span>
      <span>{result.critic.rejectedClaims.length} rejected claims</span>
      {result.critic.uncertainties.map((item) => <small key={item}>{item}</small>)}
    </div>}
  </div>;
}

function WorkflowNode({ data }: { data: { label: string; kind: string; done: boolean } }) {
  return <div className={`workflow-flow-node ${data.done ? "done" : ""}`}>
    <Handle type="target" position={Position.Left} />
    <span>{data.kind}</span>
    <strong>{data.label}</strong>
    <Handle type="source" position={Position.Right} />
  </div>;
}

const workflowNodeTypes = { workflow: WorkflowNode };

function WorkflowGraph({ result }: { result: ExplainResult }) {
  const completed = useMemo(() => new Set(result.workflow?.stages.map((stage) => stage.id) ?? []), [result.workflow]);
  const graph = useMemo(() => {
    const makeNode = (id: string, label: string, kind: string, x: number, y: number): Node => ({
      id,
      type: "workflow",
      position: { x, y },
      data: { label, kind, done: completed.has(id) },
      draggable: false,
    });
    const nodes: Node[] = [
      makeNode("causal-trace", "Causal Trace", "deterministic", 0, 90),
      makeNode("sensor-review", "Sensor Review", "optional LLM", 250, 0),
      makeNode("rule-review", "Rule Review", "optional LLM", 250, 90),
      makeNode("execution-review", "Execution Review", "optional LLM", 250, 180),
      makeNode("critic", "Critic", "optional LLM", 520, 90),
      makeNode("final-verifier", "Final Verifier", "deterministic", 760, 90),
    ];
    const edges: Edge[] = [
      { id: "trace-sensor", source: "causal-trace", target: "sensor-review", animated: true },
      { id: "trace-rule", source: "causal-trace", target: "rule-review", animated: true },
      { id: "trace-execution", source: "causal-trace", target: "execution-review", animated: true },
      { id: "sensor-critic", source: "sensor-review", target: "critic" },
      { id: "rule-critic", source: "rule-review", target: "critic" },
      { id: "execution-critic", source: "execution-review", target: "critic" },
      { id: "critic-final", source: "critic", target: "final-verifier" },
    ].map((edge) => ({ ...edge, style: { stroke: "#9a8da1" } }));
    return { nodes, edges };
  }, [completed]);

  return <div className="workflow-graph" aria-label="Mastra workflow graph">
    <strong><GitBranch size={14} /> Mastra Graph</strong>
    <div className="workflow-flow" style={{ height: 260 }}>
      <ReactFlow nodes={graph.nodes} edges={graph.edges} nodeTypes={workflowNodeTypes} fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} panOnDrag={false} zoomOnScroll={false} zoomOnPinch={false} zoomOnDoubleClick={false} proOptions={{ hideAttribution: true }}>
        <Background color="#ddd6e8" gap={24} />
      </ReactFlow>
    </div>
  </div>;
}

function SemanticPolicyTrace({ steps }: { steps: string[] }) {
  return <div className="semantic-policy-trace">
    <strong>Ontology policy processing</strong>
    {steps.map((step, index) => <span key={`${step}-${index}`}>{step}</span>)}
  </div>;
}
