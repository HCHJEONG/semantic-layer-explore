import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const semanticClasses = sqliteTable("semantic_classes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description").notNull(),
});

export const semanticProperties = sqliteTable("semantic_properties", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  domainClassId: integer("domain_class_id").notNull().references(() => semanticClasses.id),
  rangeClassId: integer("range_class_id").notNull().references(() => semanticClasses.id),
  description: text("description").notNull(),
});

export const semanticIndividuals = sqliteTable("semantic_individuals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  classId: integer("class_id").notNull().references(() => semanticClasses.id),
  description: text("description").notNull(),
  externalId: text("external_id").unique(),
});

export const semanticRelations = sqliteTable("semantic_relations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  subjectId: integer("subject_id").notNull().references(() => semanticIndividuals.id),
  propertyId: integer("property_id").notNull().references(() => semanticProperties.id),
  objectId: integer("object_id").notNull().references(() => semanticIndividuals.id),
});

export const sensors = sqliteTable("sensors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  unit: text("unit").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const devices = sqliteTable("devices", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  stateJson: text("state_json").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  updatedAt: text("updated_at").notNull(),
});

export const sensorReadings = sqliteTable("sensor_readings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: text("event_id").notNull().unique(),
  sensorId: text("sensor_id").notNull().references(() => sensors.id),
  valueJson: text("value_json").notNull(),
  measuredAt: text("measured_at").notNull(),
  source: text("source").notNull(),
}, (table) => [index("idx_sensor_readings_measured_at").on(table.measuredAt)]);

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: text("event_id").notNull().unique(),
  type: text("type").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  payloadJson: text("payload_json").notNull(),
  occurredAt: text("occurred_at").notNull(),
});

export const rules = sqliteTable("rules", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  conditionJson: text("condition_json").notNull(),
  actionJson: text("action_json").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  cooldownSeconds: integer("cooldown_seconds").notNull().default(10),
  lastTriggeredAt: text("last_triggered_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
