import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";

async function makeUser(workspaceId: string, email: string, role: "owner" | "admin" | "member" = "member") {
  return prisma.user.create({
    data: {
      workspaceId,
      email,
      passwordHash: await hashPassword("x"),
      displayName: email,
      role,
    },
  });
}

describe("contact uniqueness", () => {
  let workspaceId: string;

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.contact.deleteMany();
    await prisma.importBatch.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.user.deleteMany();
    await prisma.workspace.deleteMany();
    const ws = await prisma.workspace.create({ data: { name: "test" } });
    workspaceId = ws.id;
  });

  it("rejects same email for same owner", async () => {
    const u = await makeUser(workspaceId, "u@x.com");
    await prisma.contact.create({
      data: { workspaceId, ownerUserId: u.id, email: "b@x.com", displayName: "B" },
    });
    await expect(
      prisma.contact.create({
        data: { workspaceId, ownerUserId: u.id, email: "b@x.com", displayName: "B2" },
      })
    ).rejects.toThrow();
  });

  it("allows same email for different owners", async () => {
    const u1 = await makeUser(workspaceId, "u1@x.com");
    const u2 = await makeUser(workspaceId, "u2@x.com");
    await prisma.contact.create({
      data: { workspaceId, ownerUserId: u1.id, email: "b@x.com", displayName: "B" },
    });
    const c2 = await prisma.contact.create({
      data: { workspaceId, ownerUserId: u2.id, email: "b@x.com", displayName: "B" },
    });
    expect(c2.id).toBeTruthy();
  });
});
