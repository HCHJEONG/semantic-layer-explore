import { z } from "zod";

export class InputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputValidationError";
  }
}

export const classInput = z.object({ name: z.string().trim().min(1).max(60), description: z.string().trim().min(1).max(240) });
export const propertyInput = z.object({ name: z.string().trim().min(1).max(60), domainClassId: z.number().int().positive(), rangeClassId: z.number().int().positive(), description: z.string().trim().min(1).max(240) });
export const individualInput = z.object({ name: z.string().trim().min(1).max(60), classId: z.number().int().positive(), description: z.string().trim().min(1).max(240) });
export const relationInput = z.object({ subjectId: z.number().int().positive(), propertyId: z.number().int().positive(), objectId: z.number().int().positive() });

export function errorResponse(error: unknown) {
  if (error instanceof z.ZodError) return Response.json({ error: "Invalid input", details: error.flatten() }, { status: 400 });
  if (error instanceof InputValidationError) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
}
