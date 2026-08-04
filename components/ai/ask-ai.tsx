"use client";

import { useCallback, useState } from "react";
import { ArrowRight, Bot, Braces, Database, Network, Send, Sparkles } from "lucide-react";

const examples = ["현재 상태 알려줘.", "팬이 왜 켜졌어?", "최근 실행된 규칙은?", "Which devices are currently on?"];

export function AskAi() {
  const [question, setQuestion] = useState(examples[0]);
  const [answer, setAnswer] = useState("");
  const [trace, setTrace] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState("");

  const ask = useCallback(async () => {
    if (!question.trim() || loading) return;
    setLoading(true); setAnswer(""); setTrace([]); setError("");
    try {
      const response = await fetch("/api/ai/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gemini could not answer.");
      setAnswer(result.answer); setTrace(result.trace || []); setRemaining(result.remaining ?? null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to answer");
    } finally {
      setLoading(false);
    }
  }, [question, loading]);

  return <section className="ai-page">
    <div className="ai-intro"><div className="ai-orb"><Bot size={28} /></div><div className="eyebrow">PHYSICAL WORKSPACE ANALYST</div><h1>Ask what is happening.</h1><p>Gemini inspects the ontology first, then uses current state, approved rules, and auditable events. It never touches SQLite or hardware directly.</p></div>
    <div className="ask-card panel">
      <label htmlFor="question">Your question</label>
      <div className="ask-row"><input id="question" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => event.key === "Enter" && ask()} placeholder="Ask about sensors, devices, rules, or recent events…" /><button onClick={ask} disabled={loading}>{loading ? "Thinking…" : <><span>Ask</span><Send size={16} /></>}</button></div>
      <div className="examples">{examples.map((example) => <button key={example} onClick={() => setQuestion(example)}>{example}</button>)}</div>
    </div>
    {(answer || loading) && <div className="answer-card panel"><div className="answer-label"><Sparkles size={15} /> ANSWER {remaining !== null && <b>{remaining} questions left today</b>}</div>{loading ? <div className="thinking"><i /><i /><i /> Reading the ontology</div> : <p>{answer}</p>}{trace.length > 0 && <div className="trace">{trace.map((step, index) => <span key={`${step}-${index}`}>{step}{index < trace.length - 1 && <ArrowRight size={12} />}</span>)}</div>}</div>}
    {error && <div className="error">{error}</div>}
    <div className="pipeline"><span><Bot />Gemini</span><ArrowRight/><span><Network />Semantic Layer</span><ArrowRight/><span><Braces />REST API</span><ArrowRight/><span><Database />SQLite</span></div>
  </section>;
}
