export type ClassItem = { id: number; name: string; description: string };
export type PropertyItem = { id: number; name: string; description: string; domain: string; range: string };
export type IndividualItem = { id: number; name: string; description: string; class: string; externalId: string | null };
export type RelationItem = { id: number; subject: string; predicate: string; object: string };

export type Ontology = {
  classes: ClassItem[];
  properties: PropertyItem[];
  individuals: IndividualItem[];
  relations: RelationItem[];
};

export type OntologyKind = "Class" | "Property" | "Individual" | "Relation";
export type OntologyItem = ClassItem | PropertyItem | IndividualItem | RelationItem;
export type OntologySelection = { kind: OntologyKind; item: OntologyItem };

export function getOntologyItemLabel(item: OntologyItem) {
  if ("predicate" in item) return `${item.subject} ${item.predicate} ${item.object}`;
  return item.name;
}
