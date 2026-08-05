import { Box, CircleDot, Sparkles, UserRound } from "lucide-react";
import type { OntologySelection } from "@/domain/ontology";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

function getSemanticMeaning(selection: OntologySelection) {
  if ("domain" in selection.item) return `${selection.item.name} connects ${selection.item.domain} to ${selection.item.range}.`;
  if ("class" in selection.item) return `${selection.item.name} is a concrete instance of ${selection.item.class}.`;
  return `${selection.item.name} defines a reusable business concept.`;
}

export function ObjectDetail({ selection }: { selection: OntologySelection | null }) {
  return <Card className="detail">
    <CardContent className="p-6">
      <div className="eyebrow">SELECTED OBJECT</div>
      {selection ? <>
        <div className="object-heading"><div className={`object-icon ${selection.kind.toLowerCase()}`}>{selection.kind === "Class" ? <Box /> : selection.kind === "Property" ? <CircleDot /> : <UserRound />}</div><div><span>{selection.kind}</span><h1>{selection.item.name}</h1></div></div>
        <p className="description">{selection.item.description}</p>
        <div className="field-grid">
          <Label>Identifier<strong>{selection.item.id}</strong></Label>
          <Label>Semantic type<strong>{selection.kind}</strong></Label>
          {"class" in selection.item && <Label>Instance of<strong>{selection.item.class}</strong></Label>}
          {"externalId" in selection.item && selection.item.externalId && <Label>Runtime binding<strong>{selection.item.externalId}</strong></Label>}
          {"domain" in selection.item && <><Label>Domain<strong>{selection.item.domain}</strong></Label><Label>Range<strong>{selection.item.range}</strong></Label></>}
        </div>
        <div className="meaning"><Sparkles size={16} /><div><b>Semantic meaning</b><p>{getSemanticMeaning(selection)}</p></div></div>
      </> : <div className="empty">Choose an ontology object to inspect it.</div>}
    </CardContent>
  </Card>;
}