import { Box, CircleDot, Search, UserRound } from "lucide-react";
import type { Ontology, OntologyItem, OntologyKind, OntologySelection } from "@/domain/ontology";

export function OntologyTree({ ontology, selection, loading, onSelect }: {
  ontology: Ontology | null;
  selection: OntologySelection | null;
  loading: boolean;
  onSelect: (kind: OntologyKind, item: OntologyItem) => void;
}) {
  const sections = ontology ? [
    { title: "Classes", icon: Box, kind: "Class" as const, items: ontology.classes },
    { title: "Properties", icon: CircleDot, kind: "Property" as const, items: ontology.properties },
    { title: "Individuals", icon: UserRound, kind: "Individual" as const, items: ontology.individuals },
  ] : [];

  return <aside className="sidebar panel">
    <div className="panel-title"><div><span>ONTOLOGY</span><h2>Explorer</h2></div><Search size={17} /></div>
    {loading && <div className="loading-lines">Loading semantic layer…</div>}
    {sections.map((section) => <div className="tree-section" key={section.title}>
      <h3><section.icon size={14} /> {section.title}<b>{section.items.length}</b></h3>
      {section.items.map((item) => <button key={item.id} className={selection?.kind === section.kind && selection.item.id === item.id ? "selected" : ""} onClick={() => onSelect(section.kind, item)}><span className={`dot ${section.kind.toLowerCase()}`} />{item.name}</button>)}
    </div>)}
  </aside>;
}
