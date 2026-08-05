import { Braces } from "lucide-react";
import type { Ontology, OntologySelection } from "@/domain/ontology";
import { Card, CardContent } from "@/components/ui/card";

export function JsonViewer({ ontology, selection }: { ontology: Ontology | null; selection: OntologySelection | null }) {
  return <Card className="json">
    <div className="json-head"><div><Braces size={15} /><span>RAW JSON</span></div><b>/api/ontology</b></div>
    <CardContent className="p-4">
      <pre>{JSON.stringify(selection ? selection.item : ontology, null, 2)}</pre>
    </CardContent>
    <div className="json-foot"><i /> Live API response</div>
  </Card>;
}