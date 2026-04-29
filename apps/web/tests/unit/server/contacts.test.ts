import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { listContactsForUser, getContactForUser } from "@/server/contacts";

async function setup() {
  await prisma.auditEvent.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.importBatch.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.user.deleteMany();
  await prisma.workspace.deleteMany();
  const ws = await prisma.workspace.create({ data: { name: "T" } });
  const owner = await prisma.user.create({
    data: {
      workspaceId: ws.id,
      email: "o@x",
      passwordHash: await hashPassword("x"),
      displayName: "Owner",
      role: "owner",
    },
  });
  const m1 = await prisma.user.create({
    data: {
      workspaceId: ws.id,
      email: "a@x",
      passwordHash: await hashPassword("x"),
      displayName: "A",
      role: "member",
    },
  });
  const m2 = await prisma.user.create({
    data: {
      workspaceId: ws.id,
      email: "b@x",
      passwordHash: await hashPassword("x"),
      displayName: "B",
      role: "member",
    },
  });
  await prisma.contact.create({
    data: {
      workspaceId: ws.id,
      ownerUserId: m1.id,
      email: "c1@x",
      displayName: "C1",
    },
  });
  await prisma.contact.create({
    data: {
      workspaceId: ws.id,
      ownerUserId: m2.id,
      email: "c2@x",
      displayName: "C2",
    },
  });
  return { ws, owner, m1, m2 };
}

describe("contacts visibility", () => {
  it("member sees only their own contacts", async () => {
    const { ws, m1 } = await setup();
    const list = await listContactsForUser({
      workspaceId: ws.id,
      userId: m1.id,
      role: "member",
    });
    expect(list.length).toBe(1);
    expect(list[0].email).toBe("c1@x");
  });

  it("owner sees all contacts", async () => {
    const { ws, owner } = await setup();
    const list = await listContactsForUser({
      workspaceId: ws.id,
      userId: owner.id,
      role: "owner",
    });
    expect(list.length).toBe(2);
  });

  it("member cannot fetch another member's contact (returns null)", async () => {
    const { ws, m1, m2 } = await setup();
    const m2contact = (await prisma.contact.findFirst({
      where: { ownerUserId: m2.id },
    }))!;
    const result = await getContactForUser({
      workspaceId: ws.id,
      userId: m1.id,
      role: "member",
      contactId: m2contact.id,
    });
    expect(result).toBeNull();
  });
});
