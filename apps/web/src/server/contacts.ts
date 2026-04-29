import { prisma } from "@/lib/db";
import type { Role } from "@prisma/client";

export type AuthCtx = {
  workspaceId: string;
  userId: string;
  role: Role;
};

const isAdmin = (r: Role) => r === "admin" || r === "owner";

export async function listContactsForUser(ctx: AuthCtx) {
  return prisma.contact.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      deletedAt: null,
      ...(isAdmin(ctx.role) ? {} : { ownerUserId: ctx.userId }),
    },
    orderBy: { createdAt: "desc" },
    include: { owner: { select: { id: true, displayName: true } } },
  });
}

export async function getContactForUser(
  ctx: AuthCtx & { contactId: string }
) {
  const c = await prisma.contact.findFirst({
    where: {
      id: ctx.contactId,
      workspaceId: ctx.workspaceId,
      deletedAt: null,
      ...(isAdmin(ctx.role) ? {} : { ownerUserId: ctx.userId }),
    },
  });
  return c;
}

export async function softDeleteContact(
  ctx: AuthCtx & { contactId: string }
) {
  const target = await getContactForUser(ctx);
  if (!target) return null;
  return prisma.contact.update({
    where: { id: target.id },
    data: { deletedAt: new Date() },
  });
}

export async function updateContact(
  ctx: AuthCtx & { contactId: string },
  patch: Partial<{
    displayName: string;
    language: string | null;
    country: string | null;
    niche: string | null;
    followersCount: number | null;
    notes: string | null;
    phone: string | null;
    youtubeChannelName: string | null;
  }>
) {
  const target = await getContactForUser(ctx);
  if (!target) return null;
  return prisma.contact.update({ where: { id: target.id }, data: patch });
}
