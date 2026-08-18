import { Box, CircleDot, GitBranch, Search, UserRound } from "lucide-react";
import { getOntologyItemLabel, type Ontology, type OntologyItem, type OntologyKind, type OntologySelection } from "@/domain/ontology";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

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
    { title: "Relations", icon: GitBranch, kind: "Relation" as const, items: ontology.relations },
  ] : [];

  return <Card className="sidebar">
    <CardHeader className="panel-title">
      <div><span>ONTOLOGY</span><CardTitle>Semantic Map</CardTitle></div>
      <Search size={17} />
    </CardHeader>
    <CardContent className="p-4">
      {loading && <div className="flex flex-col gap-2">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-8 w-full" />)}</div>}
      {sections.map((section) => <div className="tree-section" key={section.title}>
        <h3><section.icon size={14} /> {section.title}<Badge variant="secondary">{section.items.length}</Badge></h3>
        {section.items.map((item) => <button key={item.id} className={selection?.kind === section.kind && selection.item.id === item.id ? "selected" : ""} onClick={() => onSelect(section.kind, item)}><span className={`dot ${section.kind.toLowerCase()}`} />{getOntologyItemLabel(item)}</button>)}
      </div>)}
    </CardContent>
  </Card>;
}
