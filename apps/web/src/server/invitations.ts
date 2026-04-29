import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { randomBytes } from "node:crypto";
import type { Role } from "@prisma/client";

const isAdmin = (r: Role) => r === "admin" || r === "owner";

export async function createInvitation(input: {
  workspaceId: string;
  actor: { id: string; role: Role };
  email: string;
  role: "admin" | "member";
  expiryDays: number | null;
}) {
  if (!isAdmin(input.actor.role)) throw new Error("forbidden");

  const token = randomBytes(32).toString("base64url");
  const expiresAt =
    input.expiryDays === null
      ? null
      : new Date(Date.now() + input.expiryDays * 24 * 60 * 60 * 1000);

  return prisma.invitation.create({
    data: {
      workspaceId: input.workspaceId,
      email: input.email.toLowerCase().trim(),
      role: input.role,
      token,
      createdById: input.actor.id,
      expiresAt,
    },
  });
}

export async function acceptInvitation(input: {
  token: string;
  displayName: string;
  password: string;
}) {
  return prisma.$transaction(async (tx) => {
    const inv = await tx.invitation.findUnique({ where: { token: input.token } });
    if (!inv) throw new Error("invalid invitation");
    if (inv.acceptedAt) throw new Error("invitation already used");
    if (inv.expiresAt && inv.expiresAt < new Date()) throw new Error("invitation expired");

    const user = await tx.user.create({
      data: {
        workspaceId: inv.workspaceId,
        email: inv.email,
        passwordHash: await hashPassword(input.password),
        displayName: input.displayName,
        role: inv.role,
      },
    });
    await tx.invitation.update({
      where: { id: inv.id },
      data: { acceptedAt: new Date(), acceptedById: user.id },
    });
    return user;
  });
}

export async function revokeInvitation(input: {
  workspaceId: string;
  actor: { id: string; role: Role };
  invitationId: string;
}) {
  if (!isAdmin(input.actor.role)) throw new Error("forbidden");
  await prisma.invitation.update({
    where: { id: input.invitationId },
    data: { expiresAt: new Date() },
  });
}

export async function listInvitations(input: {
  workspaceId: string;
  actor: { role: Role };
}) {
  if (!isAdmin(input.actor.role)) throw new Error("forbidden");
  return prisma.invitation.findMany({
    where: { workspaceId: input.workspaceId },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { displayName: true } } },
  });
}
