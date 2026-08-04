import { Braces } from "lucide-react";
import type { Ontology, OntologySelection } from "@/domain/ontology";

export function JsonViewer({ ontology, selection }: { ontology: Ontology | null; selection: OntologySelection | null }) {
  return <aside className="json panel">
    <div className="json-head"><div><Braces size={15} /><span>RAW JSON</span></div><b>/api/ontology</b></div>
    <pre>{JSON.stringify(selection ? selection.item : ontology, null, 2)}</pre>
    <div className="json-foot"><i /> Live API response</div>
  </aside>;
}
