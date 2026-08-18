import "server-only";

import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { semanticClasses, semanticIndividuals, semanticProperties, semanticRelations } from "@/db/schema";

export type ClassRow = typeof semanticClasses.$inferSelect;
export type PropertyRow = typeof semanticProperties.$inferSelect;
export type IndividualRow = typeof semanticIndividuals.$inferSelect;
export type RelationRow = typeof semanticRelations.$inferSelect;

export type NewClass = typeof semanticClasses.$inferInsert;
export type NewProperty = typeof semanticProperties.$inferInsert;
export type NewIndividual = typeof semanticIndividuals.$inferInsert;

export type OntologyStore = {
  listClasses(): Promise<ClassRow[]>;
  listProperties(): Promise<PropertyRow[]>;
  listIndividuals(): Promise<IndividualRow[]>;
  listRelations(): Promise<RelationRow[]>;
  createClass(input: NewClass): Promise<ClassRow>;
  createProperty(input: NewProperty): Promise<PropertyRow>;
  createIndividual(input: NewIndividual): Promise<IndividualRow>;
};

export function getOntologyStore(): OntologyStore {
  return {
    async listClasses() {
      return getDb().select().from(semanticClasses).orderBy(asc(semanticClasses.id)).all();
    },
    async listProperties() {
      return getDb().select().from(semanticProperties).orderBy(asc(semanticProperties.id)).all();
    },
    async listIndividuals() {
      return getDb().select().from(semanticIndividuals).orderBy(asc(semanticIndividuals.id)).all();
    },
    async listRelations() {
      return getDb().select().from(semanticRelations).orderBy(asc(semanticRelations.id)).all();
    },
    async createClass(input) {
      return getDb().insert(semanticClasses).values(input).returning().get();
    },
    async createProperty(input) {
      return getDb().insert(semanticProperties).values(input).returning().get();
    },
    async createIndividual(input) {
      return getDb().insert(semanticIndividuals).values(input).returning().get();
    },
  };
}
