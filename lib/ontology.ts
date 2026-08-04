import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { classes, individuals, properties, relations } from "@/db/schema";

type ClassRow = typeof classes.$inferSelect;
type PropertyRow = typeof properties.$inferSelect;
type IndividualRow = typeof individuals.$inferSelect;
type RelationRow = typeof relations.$inferSelect;

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
  return getDb().select().from(classes).orderBy(asc(classes.id)).all();
}

export function getProperties() {
  const db = getDb();
  const classRows = db.select().from(classes).orderBy(asc(classes.id)).all();
  const propertyRows = db.select().from(properties).orderBy(asc(properties.id)).all();
  return resolveProperties(propertyRows, classRows);
}

export function getIndividuals() {
  const db = getDb();
  const classRows = db.select().from(classes).orderBy(asc(classes.id)).all();
  const individualRows = db.select().from(individuals).orderBy(asc(individuals.id)).all();
  return resolveIndividuals(individualRows, classRows);
}

export function getRelations() {
  const db = getDb();
  const individualRows = db.select().from(individuals).orderBy(asc(individuals.id)).all();
  const propertyRows = db.select().from(properties).orderBy(asc(properties.id)).all();
  const relationRows = db.select().from(relations).orderBy(asc(relations.id)).all();
  return resolveRelations(relationRows, individualRows, propertyRows);
}

export function getOntology() {
  const db = getDb();
  const classRows = db.select().from(classes).orderBy(asc(classes.id)).all();
  const propertyRows = db.select().from(properties).orderBy(asc(properties.id)).all();
  const individualRows = db.select().from(individuals).orderBy(asc(individuals.id)).all();
  const relationRows = db.select().from(relations).orderBy(asc(relations.id)).all();

  return {
    classes: classRows,
    properties: resolveProperties(propertyRows, classRows),
    individuals: resolveIndividuals(individualRows, classRows),
    relations: resolveRelations(relationRows, individualRows, propertyRows),
  };
}
