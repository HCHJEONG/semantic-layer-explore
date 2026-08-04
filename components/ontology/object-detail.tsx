import { Box, CircleDot, Sparkles, UserRound } from "lucide-react";
import type { OntologySelection } from "@/domain/ontology";

function getSemanticMeaning(selection: OntologySelection) {
  if ("domain" in selection.item) return `${selection.item.name} connects ${selection.item.domain} to ${selection.item.range}.`;
  if ("class" in selection.item) return `${selection.item.name} is a concrete instance of ${selection.item.class}.`;
  return `${selection.item.name} defines a reusable business concept.`;
}

export function ObjectDetail({ selection }: { selection: OntologySelection | null }) {
  return <section className="detail panel">
    <div className="eyebrow">SELECTED OBJECT</div>
    {selection ? <>
      <div className="object-heading"><div className={`object-icon ${selection.kind.toLowerCase()}`}>{selection.kind === "Class" ? <Box /> : selection.kind === "Property" ? <CircleDot /> : <UserRound />}</div><div><span>{selection.kind}</span><h1>{selection.item.name}</h1></div></div>
      <p className="description">{selection.item.description}</p>
      <div className="field-grid"><label>Identifier<strong>{selection.item.id}</strong></label><label>Semantic type<strong>{selection.kind}</strong></label>
        {"class" in selection.item && <label>Instance of<strong>{selection.item.class}</strong></label>}
        {"externalId" in selection.item && selection.item.externalId && <label>Runtime binding<strong>{selection.item.externalId}</strong></label>}
        {"domain" in selection.item && <><label>Domain<strong>{selection.item.domain}</strong></label><label>Range<strong>{selection.item.range}</strong></label></>}
      </div>
      <div className="meaning"><Sparkles size={16} /><div><b>Semantic meaning</b><p>{getSemanticMeaning(selection)}</p></div></div>
    </> : <div className="empty">Choose an ontology object to inspect it.</div>}
  </section>;
}
