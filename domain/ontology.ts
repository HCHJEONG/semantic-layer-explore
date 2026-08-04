export type ClassItem = { id: number; name: string; description: string };
export type PropertyItem = { id: number; name: string; description: string; domain: string; range: string };
export type IndividualItem = { id: number; name: string; description: string; class: string };
export type RelationItem = { id: number; subject: string; property: string; object: string };

export type Ontology = {
  classes: ClassItem[];
  properties: PropertyItem[];
  individuals: IndividualItem[];
  relations: RelationItem[];
};

export type OntologyKind = "Class" | "Property" | "Individual";
export type OntologyItem = ClassItem | PropertyItem | IndividualItem;
export type OntologySelection = { kind: OntologyKind; item: OntologyItem };
