import type { Prisma, PrismaClient } from "@prisma/client";

export async function writeAuditEvent(
  db: Pick<PrismaClient, "auditEvent">,
  input: {
    actorId?: string | null;
    circleId?: string | null;
    eventType: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  },
) {
  await db.auditEvent.create({
    data: {
      actorId: input.actorId ?? null,
      circleId: input.circleId ?? null,
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}
