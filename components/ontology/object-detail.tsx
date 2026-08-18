import { Box, CircleDot, GitBranch, Sparkles, UserRound } from "lucide-react";
import { getOntologyItemLabel, type OntologySelection } from "@/domain/ontology";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

function getSemanticMeaning(selection: OntologySelection) {
  if ("predicate" in selection.item) return `${selection.item.subject} ${selection.item.predicate} ${selection.item.object} is an asserted semantic relation.`;
  if ("domain" in selection.item) return `${selection.item.name} connects ${selection.item.domain} to ${selection.item.range}.`;
  if ("class" in selection.item) return `${selection.item.name} is a concrete instance of ${selection.item.class}.`;
  return `${selection.item.name} defines a reusable business concept.`;
}

function getObjectIcon(selection: OntologySelection) {
  if (selection.kind === "Class") return <Box />;
  if (selection.kind === "Property") return <CircleDot />;
  if (selection.kind === "Relation") return <GitBranch />;
  return <UserRound />;
}

export function ObjectDetail({ selection }: { selection: OntologySelection | null }) {
  return <Card className="detail">
    <CardContent className="p-6">
      <div className="eyebrow">SELECTED OBJECT</div>
      {selection ? <>
        <div className="object-heading"><div className={`object-icon ${selection.kind.toLowerCase()}`}>{getObjectIcon(selection)}</div><div><span>{selection.kind}</span><h1>{getOntologyItemLabel(selection.item)}</h1></div></div>
        {"description" in selection.item && <p className="description">{selection.item.description}</p>}
        <div className="field-grid">
          <Label>Identifier<strong>{selection.item.id}</strong></Label>
          <Label>Semantic type<strong>{selection.kind}</strong></Label>
          {"class" in selection.item && <Label>Instance of<strong>{selection.item.class}</strong></Label>}
          {"externalId" in selection.item && selection.item.externalId && <Label>Runtime binding<strong>{selection.item.externalId}</strong></Label>}
          {"domain" in selection.item && <><Label>Domain<strong>{selection.item.domain}</strong></Label><Label>Range<strong>{selection.item.range}</strong></Label></>}
          {"predicate" in selection.item && <><Label>Subject<strong>{selection.item.subject}</strong></Label><Label>Predicate<strong>{selection.item.predicate}</strong></Label><Label>Object<strong>{selection.item.object}</strong></Label></>}
        </div>
        <div className="meaning"><Sparkles size={16} /><div><b>Semantic meaning</b><p>{getSemanticMeaning(selection)}</p></div></div>
      </> : <div className="empty">Choose an ontology object to inspect it.</div>}
    </CardContent>
  </Card>;
}
