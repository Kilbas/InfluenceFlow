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

export async function listContactsWithDuplicates(ctx: AuthCtx) {
  const contacts = await listContactsForUser(ctx);
  if (isAdmin(ctx.role))
    return contacts.map((c) => ({ ...c, duplicate: null as null | { displayName: string } }));
  if (contacts.length === 0)
    return contacts.map((c) => ({ ...c, duplicate: null as null | { displayName: string } }));

  const emails = contacts.map((c) => c.email);
  const handles = contacts
    .map((c) => c.instagramHandle)
    .filter(Boolean) as string[];

  const colleagueRows = await prisma.contact.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      deletedAt: null,
      ownerUserId: { not: ctx.userId },
      OR: [{ email: { in: emails } }, { instagramHandle: { in: handles } }],
    },
    select: {
      email: true,
      instagramHandle: true,
      owner: { select: { displayName: true } },
    },
  });

  const byEmail = new Map<string, string>();
  const byHandle = new Map<string, string>();
  for (const r of colleagueRows) {
    byEmail.set(r.email, r.owner.displayName);
    if (r.instagramHandle) byHandle.set(r.instagramHandle, r.owner.displayName);
  }

  return contacts.map((c) => {
    const dup =
      byEmail.get(c.email) ??
      (c.instagramHandle ? byHandle.get(c.instagramHandle) : undefined);
    return { ...c, duplicate: dup ? { displayName: dup } : null };
  });
}
