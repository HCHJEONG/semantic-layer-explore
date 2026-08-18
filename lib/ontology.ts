import { getOntologyStore, type ClassRow, type IndividualRow, type PropertyRow, type RelationRow } from "@/lib/stores/ontology-store";

function resolveProperties(rows: PropertyRow[], classRows: ClassRow[]) {
  const classNames = new Map(classRows.map((item) => [item.id, item.name]));
  return rows.map((item) => ({
    ...item,
    domain: classNames.get(item.domainClassId),
    range: classNames.get(item.rangeClassId),
  }));
}

function resolveIndividuals(rows: IndividualRow[], classRows: ClassRow[]) {
  const classNames = new Map(classRows.map((item) => [item.id, item.name]));
  return rows.map((item) => ({ ...item, class: classNames.get(item.classId) }));
}

function resolveRelations(rows: RelationRow[], individualRows: IndividualRow[], propertyRows: PropertyRow[]) {
  const individualNames = new Map(individualRows.map((item) => [item.id, item.name]));
  const propertyNames = new Map(propertyRows.map((item) => [item.id, item.name]));
  return rows.map((item) => ({
    ...item,
    subject: individualNames.get(item.subjectId),
    property: propertyNames.get(item.propertyId),
    object: individualNames.get(item.objectId),
  }));
}

export async function getClasses() {
  return getOntologyStore().listClasses();
}

export async function getProperties() {
  const store = getOntologyStore();
  const [classRows, propertyRows] = await Promise.all([store.listClasses(), store.listProperties()]);
  return resolveProperties(propertyRows, classRows);
}

export async function getIndividuals() {
  const store = getOntologyStore();
  const [classRows, individualRows] = await Promise.all([store.listClasses(), store.listIndividuals()]);
  return resolveIndividuals(individualRows, classRows);
}

export async function getRelations() {
  const store = getOntologyStore();
  const [individualRows, propertyRows, relationRows] = await Promise.all([store.listIndividuals(), store.listProperties(), store.listRelations()]);
  return resolveRelations(relationRows, individualRows, propertyRows);
}

export async function getOntology() {
  const store = getOntologyStore();
  const [classRows, propertyRows, individualRows, relationRows] = await Promise.all([
    store.listClasses(),
    store.listProperties(),
    store.listIndividuals(),
    store.listRelations(),
  ]);

  return {
    classes: classRows,
    properties: resolveProperties(propertyRows, classRows),
    individuals: resolveIndividuals(individualRows, classRows),
    relations: resolveRelations(relationRows, individualRows, propertyRows),
  };
}

export async function createClass(input: Parameters<ReturnType<typeof getOntologyStore>["createClass"]>[0]) {
  return getOntologyStore().createClass(input);
}

export async function createProperty(input: Parameters<ReturnType<typeof getOntologyStore>["createProperty"]>[0]) {
  return getOntologyStore().createProperty(input);
}

export async function createIndividual(input: Parameters<ReturnType<typeof getOntologyStore>["createIndividual"]>[0]) {
  return getOntologyStore().createIndividual(input);
}
