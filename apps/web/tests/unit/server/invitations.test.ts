import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { createInvitation, acceptInvitation } from "@/server/invitations";

async function setup() {
  await prisma.auditEvent.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.importBatch.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.user.deleteMany();
  await prisma.workspace.deleteMany();
  const ws = await prisma.workspace.create({ data: { name: "T" } });
  const owner = await prisma.user.create({
    data: { workspaceId: ws.id, email: "o@x", passwordHash: await hashPassword("x"), displayName: "O", role: "owner" },
  });
  const member = await prisma.user.create({
    data: { workspaceId: ws.id, email: "m@x", passwordHash: await hashPassword("x"), displayName: "M", role: "member" },
  });
  return { ws, owner, member };
}

describe("invitations", () => {
  it("admin/owner can create invitation", async () => {
    const { ws, owner } = await setup();
    const inv = await createInvitation({
      workspaceId: ws.id,
      actor: { id: owner.id, role: "owner" },
      email: "new@x",
      role: "member",
      expiryDays: 30,
    });
    expect(inv.token.length).toBeGreaterThan(40);
    expect(inv.expiresAt).toBeInstanceOf(Date);
  });

  it("member cannot create invitation", async () => {
    const { ws, member } = await setup();
    await expect(
      createInvitation({
        workspaceId: ws.id,
        actor: { id: member.id, role: "member" },
        email: "new@x",
        role: "member",
        expiryDays: 30,
      })
    ).rejects.toThrow(/forbidden/i);
  });

  it("rejects acceptance of expired invitation", async () => {
    const { ws, owner } = await setup();
    const inv = await prisma.invitation.create({
      data: {
        workspaceId: ws.id,
        email: "n@x",
        role: "member",
        token: "tok-expired",
        createdById: owner.id,
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await expect(
      acceptInvitation({ token: inv.token, displayName: "N", password: "x" })
    ).rejects.toThrow(/expired|invalid/i);
  });

  it("rejects acceptance of already-accepted invitation", async () => {
    const { ws, owner } = await setup();
    const inv = await createInvitation({
      workspaceId: ws.id,
      actor: { id: owner.id, role: "owner" },
      email: "n@x",
      role: "member",
      expiryDays: 30,
    });
    await acceptInvitation({ token: inv.token, displayName: "N", password: "p" });
    await expect(
      acceptInvitation({ token: inv.token, displayName: "N2", password: "p2" })
    ).rejects.toThrow(/used|invalid/i);
  });

  it("permanent invitation has null expiresAt", async () => {
    const { ws, owner } = await setup();
    const inv = await createInvitation({
      workspaceId: ws.id,
      actor: { id: owner.id, role: "owner" },
      email: "n@x",
      role: "member",
      expiryDays: null,
    });
    expect(inv.expiresAt).toBeNull();
  });
});
