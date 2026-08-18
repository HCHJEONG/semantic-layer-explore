import "server-only";

import { asc, desc, eq, gt, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { events } from "@/db/schema";

type EventRow = typeof events.$inferSelect;

export type WorkspaceEvent = Omit<EventRow, "payloadJson"> & { payload: unknown };

export type NewWorkspaceEvent = {
  eventId: string;
  type: string;
  sourceType: string;
  sourceId: string;
  payload: unknown;
  occurredAt: string;
};

function limitEvents(limit: number) {
  return Math.min(Math.max(limit, 1), 200);
}

function toWorkspaceEvent(row: EventRow): WorkspaceEvent {
  return { ...row, payload: JSON.parse(row.payloadJson) as unknown };
}

export type EventStore = {
  getEventByEventId(eventId: string): Promise<WorkspaceEvent | null>;
  listEvents(limit?: number): Promise<WorkspaceEvent[]>;
  listEventsAfter(id: number, limit?: number): Promise<WorkspaceEvent[]>;
  listEventsBefore(id: number, limit?: number): Promise<WorkspaceEvent[]>;
  listEventsAscending(limit?: number): Promise<WorkspaceEvent[]>;
  insertEvent(event: NewWorkspaceEvent): Promise<void>;
};

export function getEventStore(): EventStore {
  return {
    async getEventByEventId(eventId) {
      const row = getDb().select().from(events).where(eq(events.eventId, eventId)).get();
      return row ? toWorkspaceEvent(row) : null;
    },
    async listEvents(limit = 50) {
      return getDb().select().from(events).orderBy(desc(events.occurredAt)).limit(limitEvents(limit)).all().map(toWorkspaceEvent);
    },
    async listEventsAfter(id, limit = 50) {
      return getDb().select().from(events).where(gt(events.id, id)).orderBy(asc(events.id)).limit(limitEvents(limit)).all().map(toWorkspaceEvent);
    },
    async listEventsBefore(id, limit = 50) {
      return getDb().select().from(events).where(lt(events.id, id)).orderBy(desc(events.id)).limit(limitEvents(limit)).all().map(toWorkspaceEvent);
    },
    async listEventsAscending(limit = 200) {
      return getDb().select().from(events).orderBy(asc(events.id)).limit(limitEvents(limit)).all().map(toWorkspaceEvent);
    },
    async insertEvent(event) {
      getDb().insert(events).values({
        eventId: event.eventId,
        type: event.type,
        sourceType: event.sourceType,
        sourceId: event.sourceId,
        payloadJson: JSON.stringify(event.payload),
        occurredAt: event.occurredAt,
      }).run();
    },
  };
}
