import { prisma } from "@/lib/db";
import type { Role } from "@prisma/client";

const isAdmin = (r: Role) => r === "admin" || r === "owner";

type ActivateResult = { ok: true } | { ok: false; blockedBy: string };

export async function activateAgent(input: {
  workspaceId: string;
  actor: { id: string; role: Role };
  contactId: string;
}): Promise<ActivateResult> {
  return prisma.$transaction(async (tx) => {
    const me = await tx.contact.findFirst({
      where: {
        id: input.contactId,
        workspaceId: input.workspaceId,
        deletedAt: null,
        ...(isAdmin(input.actor.role) ? {} : { ownerUserId: input.actor.id }),
      },
    });
    if (!me) throw new Error("not found");
    if (me.agentActive) return { ok: true } as const;

    const conflict = await tx.$queryRaw<
      { id: string; ownerDisplayName: string }[]
    >`
      SELECT c.id, u.display_name as "ownerDisplayName"
      FROM contacts c
      JOIN users u ON u.id = c.owner_user_id
      WHERE c.workspace_id = ${input.workspaceId}::uuid
        AND c.deleted_at IS NULL
        AND c.agent_active = true
        AND c.owner_user_id <> ${me.ownerUserId}::uuid
        AND (c.email = ${me.email}
             OR (${me.instagramHandle}::text IS NOT NULL AND c.instagram_handle = ${me.instagramHandle}))
      FOR UPDATE
      LIMIT 1
    `;

    if (conflict.length > 0) {
      await tx.auditEvent.create({
        data: {
          workspaceId: input.workspaceId,
          actorUserId: input.actor.id,
          action: "contact.agent_active.activation_blocked",
          entityType: "contact",
          entityId: me.id,
          payload: { blockedBy: conflict[0].ownerDisplayName, conflictId: conflict[0].id },
        },
      });
      return { ok: false, blockedBy: conflict[0].ownerDisplayName } as const;
    }

    await tx.contact.update({
      where: { id: me.id },
      data: { agentActive: true },
    });
    await tx.auditEvent.create({
      data: {
        workspaceId: input.workspaceId,
        actorUserId: input.actor.id,
        action: "contact.agent_active.toggled",
        entityType: "contact",
        entityId: me.id,
        payload: { to: true },
      },
    });
    return { ok: true } as const;
  });
}

export async function deactivateAgent(input: {
  workspaceId: string;
  actor: { id: string; role: Role };
  contactId: string;
}): Promise<{ ok: true }> {
  return prisma.$transaction(async (tx) => {
    const me = await tx.contact.findFirst({
      where: {
        id: input.contactId,
        workspaceId: input.workspaceId,
        deletedAt: null,
        ...(isAdmin(input.actor.role) ? {} : { ownerUserId: input.actor.id }),
      },
    });
    if (!me) throw new Error("not found");
    await tx.contact.update({ where: { id: me.id }, data: { agentActive: false } });
    await tx.auditEvent.create({
      data: {
        workspaceId: input.workspaceId,
        actorUserId: input.actor.id,
        action: "contact.agent_active.toggled",
        entityType: "contact",
        entityId: me.id,
        payload: { to: false },
      },
    });
    return { ok: true } as const;
  });
}
