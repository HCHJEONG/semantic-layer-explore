import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { classes, individuals, properties, relations } from "@/db/schema";

export async function getClasses() {
  return getDb().select().from(classes).orderBy(asc(classes.id));
}

export async function getProperties() {
  const db = getDb();
  const rows = await db.select().from(properties).orderBy(asc(properties.id));
  const classRows = await getClasses();
  const names = new Map(classRows.map((item) => [item.id, item.name]));
  return rows.map((item) => ({ ...item, domain: names.get(item.domainClassId), range: names.get(item.rangeClassId) }));
}

export async function getIndividuals() {
  const db = getDb();
  const rows = await db.select().from(individuals).orderBy(asc(individuals.id));
  const classRows = await getClasses();
  const names = new Map(classRows.map((item) => [item.id, item.name]));
  return rows.map((item) => ({ ...item, class: names.get(item.classId) }));
}

export async function getRelations() {
  const db = getDb();
  const rows = await db.select().from(relations).orderBy(asc(relations.id));
  const [individualRows, propertyRows] = await Promise.all([getIndividuals(), getProperties()]);
  const individualNames = new Map(individualRows.map((item) => [item.id, item.name]));
  const propertyNames = new Map(propertyRows.map((item) => [item.id, item.name]));
  return rows.map((item) => ({ ...item, subject: individualNames.get(item.subjectId), property: propertyNames.get(item.propertyId), object: individualNames.get(item.objectId) }));
}

export async function getOntology() {
  const [classRows, propertyRows, individualRows, relationRows] = await Promise.all([
    getClasses(), getProperties(), getIndividuals(), getRelations(),
  ]);
  return { classes: classRows, properties: propertyRows, individuals: individualRows, relations: relationRows };
}

export { classes, properties, individuals, relations, eq, getDb };
