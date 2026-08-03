import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const classes = sqliteTable("classes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description").notNull(),
});

export const properties = sqliteTable("properties", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  domainClassId: integer("domain_class_id").notNull().references(() => classes.id),
  rangeClassId: integer("range_class_id").notNull().references(() => classes.id),
  description: text("description").notNull(),
});

export const individuals = sqliteTable("individuals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  classId: integer("class_id").notNull().references(() => classes.id),
  description: text("description").notNull(),
});

export const relations = sqliteTable("relations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  subjectId: integer("subject_id").notNull().references(() => individuals.id),
  propertyId: integer("property_id").notNull().references(() => properties.id),
  objectId: integer("object_id").notNull().references(() => individuals.id),
});
