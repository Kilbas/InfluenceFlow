import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import type { Role } from "@prisma/client";

const isAdmin = (r: Role) => r === "admin" || r === "owner";

export async function listWorkspaceUsers(input: {
  workspaceId: string;
  actor: { role: Role };
}) {
  if (!isAdmin(input.actor.role)) throw new Error("forbidden");
  return prisma.user.findMany({
    where: { workspaceId: input.workspaceId },
    orderBy: { createdAt: "asc" },
  });
}

export async function changeUserRole(input: {
  workspaceId: string;
  actor: { role: Role };
  userId: string;
  newRole: "admin" | "member";
}) {
  if (!isAdmin(input.actor.role)) throw new Error("forbidden");
  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: input.userId } });
    if (!target || target.workspaceId !== input.workspaceId) throw new Error("not found");
    if (target.role === "owner") throw new Error("cannot change owner role");
    const updated = await tx.user.update({ where: { id: input.userId }, data: { role: input.newRole } });
    await writeAudit(tx, {
      workspaceId: input.workspaceId,
      actorUserId: null,
      action: "user.role_changed",
      entityType: "user",
      entityId: input.userId,
      payload: { from: target.role, to: input.newRole },
    });
    return updated;
  });
}

export async function deactivateUser(input: {
  workspaceId: string;
  actor: { role: Role };
  userId: string;
}) {
  if (!isAdmin(input.actor.role)) throw new Error("forbidden");
  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: input.userId } });
    if (!target || target.workspaceId !== input.workspaceId) throw new Error("not found");
    if (target.role === "owner") throw new Error("cannot deactivate owner");
    const updated = await tx.user.update({ where: { id: input.userId }, data: { deletedAt: new Date() } });
    await writeAudit(tx, {
      workspaceId: input.workspaceId,
      actorUserId: null,
      action: "user.deactivated",
      entityType: "user",
      entityId: input.userId,
    });
    return updated;
  });
}
