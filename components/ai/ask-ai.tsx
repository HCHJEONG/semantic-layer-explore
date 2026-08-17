"use client";

import { useCallback, useState } from "react";
import { ArrowRight, Bot, Braces, Database, Network, Send, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { loadOntologyPolicyCheck } from "@/lib/semantic-policy";

const examples = ["현재 운영 상태 요약해줘.", "어떤 자동화가 방금 실행됐어?", "주의해야 할 센서 변화가 있어?", "Which assets need attention right now?"];

export function AskAi() {
  const [question, setQuestion] = useState(examples[0]);
  const [answer, setAnswer] = useState("");
  const [trace, setTrace] = useState<string[]>([]);
  const [semanticTrace, setSemanticTrace] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState("");

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
  }, [question, loading]);

  async function confirmInspectionTeamQuery() {
    setSemanticTrace(["Starting semantic role policy check…"]);
    const check = await loadOntologyPolicyCheck("copilot.query");
    setSemanticTrace([check.policy.title, ...check.steps]);
    if (!check.individualFound || !check.relationFound) throw new Error(`Semantic role policy failed: ${check.steps.join(" / ")}`);
    const confirmed = window.confirm(check.policy.prompt);
    setSemanticTrace((current) => [...current, confirmed ? `User confirmed ${check.policy.requiredIndividual}.` : `User cancelled ${check.policy.requiredIndividual} confirmation.`]);
    return confirmed;
  }

  return <section className="ai-page">
    <div className="ai-intro"><div className="ai-orb"><Bot size={28} /></div><div className="eyebrow">BESTAICOM OPS ANALYST</div><h1>Ask what changed, why it happened, and what is active.</h1><p>BestAiCom AI reads the semantic map first, then explains current state, approved rules, and recent events using auditable application data.</p></div>
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

function SemanticPolicyTrace({ steps }: { steps: string[] }) {
  return <div className="semantic-policy-trace">
    <strong>Ontology policy processing</strong>
    {steps.map((step, index) => <span key={`${step}-${index}`}>{step}</span>)}
  </div>;
}
