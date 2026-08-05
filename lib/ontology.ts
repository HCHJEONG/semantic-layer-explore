import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { semanticClasses, semanticIndividuals, semanticProperties, semanticRelations } from "@/db/schema";

type ClassRow = typeof semanticClasses.$inferSelect;
type PropertyRow = typeof semanticProperties.$inferSelect;
type IndividualRow = typeof semanticIndividuals.$inferSelect;
type RelationRow = typeof semanticRelations.$inferSelect;

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

export function getClasses() {
  return getDb().select().from(semanticClasses).orderBy(asc(semanticClasses.id)).all();
}

export function getProperties() {
  const db = getDb();
  const classRows = db.select().from(semanticClasses).orderBy(asc(semanticClasses.id)).all();
  const propertyRows = db.select().from(semanticProperties).orderBy(asc(semanticProperties.id)).all();
  return resolveProperties(propertyRows, classRows);
}

export function getIndividuals() {
  const db = getDb();
  const classRows = db.select().from(semanticClasses).orderBy(asc(semanticClasses.id)).all();
  const individualRows = db.select().from(semanticIndividuals).orderBy(asc(semanticIndividuals.id)).all();
  return resolveIndividuals(individualRows, classRows);
}

export function getRelations() {
  const db = getDb();
  const individualRows = db.select().from(semanticIndividuals).orderBy(asc(semanticIndividuals.id)).all();
  const propertyRows = db.select().from(semanticProperties).orderBy(asc(semanticProperties.id)).all();
  const relationRows = db.select().from(semanticRelations).orderBy(asc(semanticRelations.id)).all();
  return resolveRelations(relationRows, individualRows, propertyRows);
}

export function getOntology() {
  const db = getDb();
  const classRows = db.select().from(semanticClasses).orderBy(asc(semanticClasses.id)).all();
  const propertyRows = db.select().from(semanticProperties).orderBy(asc(semanticProperties.id)).all();
  const individualRows = db.select().from(semanticIndividuals).orderBy(asc(semanticIndividuals.id)).all();
  const relationRows = db.select().from(semanticRelations).orderBy(asc(semanticRelations.id)).all();

  return {
    classes: classRows,
    properties: resolveProperties(propertyRows, classRows),
    individuals: resolveIndividuals(individualRows, classRows),
    relations: resolveRelations(relationRows, individualRows, propertyRows),
  };
}
