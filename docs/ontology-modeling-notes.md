# Ontology Modeling Notes

This note records the current semantic-layer modeling decisions so future OWL/RDF work does not have to rediscover the same tradeoffs.

## Current Scope

The project is still a compact semantic-layer demo, not an OWL/RDF implementation. It intentionally keeps the model small:

- `Class`
- `Property`
- `Individual`
- `Relation`

The important correction is that a resolved relation is treated as a first-class asserted triple:

```text
subject individual + predicate + object individual
```

In TypeScript and API responses, `RelationItem` therefore uses:

```ts
type RelationItem = {
  id: number;
  subject: string;
  predicate: string;
  object: string;
};
```

This keeps the UI and API close to RDF triple language without requiring RDF storage, SPARQL, reasoning, or ontology import/export.

## Property vs Predicate

The app keeps `PropertyItem` as the reusable semantic edge definition:

```text
worksFor: Person -> Company
assignedTo: Person -> Project
triggers: Rule -> Device
```

When a property is used inside an asserted relation, its role is the triple predicate:

```text
InspectionTeam worksFor BestAiCom
```

So the API/domain layer says `predicate`, while the semantic metadata table remains `semantic_properties`. This is intentional:

- `predicate` names the role inside a relation triple.
- `property` remains compatible with RDF/OWL terminology for reusable object/datatype properties.
- The database already stores the correct structure through `subject_id`, `property_id`, and `object_id`.

Renaming the DB column from `property_id` to `predicate_property_id` was considered, but deferred. A rename-only migration would add churn without changing behavior, and `property_id` is not wrong in RDF/OWL terms.

## Why Relation Is Selectable

Relations are more than visual graph edges. They are auditable semantic claims used by policy checks, Ask AI context, and Explain Why evidence.

Examples:

```text
InspectionTeam worksFor BestAiCom
OpsEngineer assignedTo BestAiCom Smart Workspace
WorkspaceAutomationRule triggers FanRelay01
```

For that reason, `Relation` is part of `OntologyKind` and relation rows are selectable in the explorer. This supports future relation detail views, provenance, editing, policy trace drill-down, and AI evidence review.

## Why ObjectProperty and DatatypeProperty Are Not Split Yet

OWL/RDF distinguishes object properties from datatype properties:

- Object property: connects an individual to another individual.
- Datatype property: connects an individual to a literal value.

Examples:

```text
InspectionTeam worksFor BestAiCom          # object property assertion
TemperatureSensor01 hasUnit "celsius"      # datatype property assertion
MainRoom hasFloor 3                        # datatype property assertion
```

The current app only models individual-to-individual assertions, so every stored relation is effectively an object property assertion. Splitting `PropertyItem` into `ObjectPropertyItem` and `DatatypePropertyItem` now would add model surface before the app has literal-valued semantic assertions.

The split should be reconsidered when the semantic layer needs any of the following:

- literal attributes in ontology data
- datatype ranges such as `string`, `integer`, `boolean`, or `dateTime`
- validation UI for literal values
- RDF export/import fidelity
- separate storage for object-property assertions and datatype-property assertions

Until then, a single `PropertyItem` keeps the demo easier to understand.

## Future OWL/RDF Direction

If the project moves closer to OWL/RDF, the likely next modeling steps are:

1. Add stable IRIs, namespaces, prefixes, labels, and comments.
2. Split object properties from datatype properties when literal assertions are introduced.
3. Add a datatype assertion store separate from `semantic_relations`.
4. Add RDF export before RDF import.
5. Add reasoning only after the data model and export shape are stable.

The current model is deliberately positioned as a bridge: close enough to RDF triple language to avoid terminology debt, but still small enough for the portfolio demo.
