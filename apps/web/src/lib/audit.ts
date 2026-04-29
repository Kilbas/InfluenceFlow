import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient | typeof prisma;

export async function writeAudit(
  tx: Tx,
  data: {
    workspaceId: string;
    actorUserId: string | null;
    action: string;
    entityType?: string;
    entityId?: string;
    payload?: unknown;
  }
) {
  await tx.auditEvent.create({
    data: {
      workspaceId: data.workspaceId,
      actorUserId: data.actorUserId,
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      payload: data.payload as Prisma.InputJsonValue,
    },
  });
}
