"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Check, Clock, Code2, Power, Sparkles, Trash2 } from "lucide-react";
import type { RuleInput, RuleRecord } from "@/domain/rule";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

const examples = ["온도가 30도를 넘으면 팬을 켜.", "조도가 100 lux보다 낮으면 LED를 켜.", "버튼을 누르면 부저를 울려."];

function conditionText(rule: RuleRecord) {
  const operators = { gt: ">", gte: "≥", lt: "<", lte: "≤", eq: "=" };
  return `${rule.condition.sensorId} ${operators[rule.condition.operator]} ${String(rule.condition.value)} ${rule.condition.unit}`;
}

export function RuleStudio() {
  const [instruction, setInstruction] = useState(examples[0]);
  const [proposal, setProposal] = useState<RuleInput | null>(null);
  const [rules, setRules] = useState<RuleRecord[]>([]);
  const [trace, setTrace] = useState<string[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const refreshRules = useCallback(async () => {
    const response = await fetch("/api/rules", { cache: "no-store" });
    if (!response.ok) throw new Error("Rules are unavailable.");
    setRules(await response.json());
  }, []);

  useEffect(() => { const initial = window.setTimeout(() => void refreshRules().catch(() => setError("Rules are unavailable.")), 0); return () => window.clearTimeout(initial); }, [refreshRules]);

  async function propose() {
    if (!instruction.trim() || busy) return;
    setBusy("propose"); setProposal(null); setTrace([]); setError("");
    try {
      const response = await fetch("/api/ai/rules/propose", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ instruction }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "BestAiCom AI could not propose a rule.");
      setProposal(result.proposal); setTrace(result.trace ?? []); setRemaining(result.remaining ?? null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to propose a rule."); }
    finally { setBusy(""); }
  }

  async function approve() {
    if (!proposal || busy) return;
    setBusy("approve"); setError("");
    try {
      const response = await fetch("/api/rules", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(proposal) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Rule could not be saved.");
      setProposal(null); await refreshRules();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save the rule."); }
    finally { setBusy(""); }
  }

  async function mutateRule(rule: RuleRecord, action: "toggle" | "delete") {
    setBusy(rule.id); setError("");
    try {
      const path = action === "delete" ? `/api/rules/${rule.id}` : `/api/rules/${rule.id}/${rule.enabled ? "disable" : "enable"}`;
      const response = await fetch(path, { method: action === "delete" ? "DELETE" : "POST" });
      if (!response.ok) throw new Error("Rule update failed.");
      await refreshRules();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Rule update failed."); }
    finally { setBusy(""); }
  }

  return <section className="rules-page">
    <div className="rules-intro"><div><span className="eyebrow">BESTAICOM AUTOMATION STUDIO</span><h1>Describe an operational rule.</h1><p>BestAiCom AI maps natural language to verified signals, assets, and approved actions before anything runs.</p></div><div className="approval-boundary"><Sparkles /><span>BestAiCom suggests<strong>Operator approves</strong></span></div></div>
    <div className="rules-layout">
      <Card className="rule-composer">
        <CardContent className="p-6">
          <Label htmlFor="instruction">Natural-language instruction</Label>
          <textarea id="instruction" value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="온도가 30도를 넘으면 팬을 켜." />
          <div className="examples">{examples.map((example) => <Button key={example} variant="outline" size="sm" onClick={() => setInstruction(example)}>{example}</Button>)}</div>
          <Button className="propose-button" onClick={() => void propose()} disabled={Boolean(busy)}><Sparkles />{busy === "propose" ? "Reading semantic map…" : "Generate rule proposal"}</Button>
          {trace.length > 0 && <div className="trace rule-trace">{trace.map((step, index) => <span key={step}>{step}{index < trace.length - 1 && <ArrowRight />}</span>)}</div>}
          {remaining !== null && <small className="remaining">{remaining} AI requests remaining today</small>}
        </CardContent>
      </Card>
      <Card className="proposal-panel">
        <CardHeader className="dashboard-title"><div><span className="eyebrow">APPROVAL GATE</span><CardTitle>Validated proposal</CardTitle></div><Code2 /></CardHeader>
        <CardContent className="p-5">
          {proposal ? <><pre>{JSON.stringify(proposal, null, 2)}</pre><div className="proposal-actions"><Button variant="ghost" onClick={() => setProposal(null)}>Discard</Button><Button className="approve" disabled={Boolean(busy)} onClick={() => void approve()}><Check />Approve & save</Button></div></> : <div className="proposal-empty"><Code2 /><strong>No proposal yet</strong><span>Generated JSON will appear here for review.</span></div>}
        </CardContent>
      </Card>
    </div>
    <Card className="rule-list-panel"><CardHeader className="dashboard-title"><div><span className="eyebrow">DETERMINISTIC RUNTIME</span><CardTitle>Approved rules</CardTitle></div><strong className="rule-count">{rules.length} rules</strong></CardHeader>
      <CardContent className="p-5">
        <div className="rule-list">{rules.length ? rules.map((rule) => <article key={rule.id} className={rule.enabled ? "enabled" : ""}><div className="rule-power"><Power /></div><div><strong>{rule.name}</strong><span>{conditionText(rule)} <ArrowRight /> {rule.action.deviceId} · {rule.action.command}</span><small><Clock /> {rule.cooldownSeconds}s cooldown · {rule.lastTriggeredAt ? `last matched ${new Date(rule.lastTriggeredAt).toLocaleString()}` : "never matched"}</small></div><div className="rule-actions"><Button variant="outline" size="sm" disabled={busy === rule.id} onClick={() => void mutateRule(rule, "toggle")}>{rule.enabled ? "Disable" : "Enable"}</Button><Button variant="ghost" size="icon" aria-label={`Delete ${rule.name}`} disabled={busy === rule.id} onClick={() => void mutateRule(rule, "delete")}><Trash2 /></Button></div></article>) : <div className="empty">No approved rules. Generate and approve the first automation above.</div>}</div>
      </CardContent>
    </Card>
    {error && <div className="error toast">{error}</div>}
  </section>;
}
