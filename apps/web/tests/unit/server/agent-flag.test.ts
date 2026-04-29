import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { activateAgent, deactivateAgent } from "@/server/agent-flag";

async function setup() {
  await prisma.auditEvent.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.importBatch.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.user.deleteMany();
  await prisma.workspace.deleteMany();
  const ws = await prisma.workspace.create({ data: { name: "T" } });
  const a = await prisma.user.create({
    data: { workspaceId: ws.id, email: "a@x", passwordHash: await hashPassword("x"), displayName: "A", role: "member" },
  });
  const b = await prisma.user.create({
    data: { workspaceId: ws.id, email: "b@x", passwordHash: await hashPassword("x"), displayName: "B", role: "member" },
  });
  return { ws, a, b };
}

describe("agent flag", () => {
  it("activates a contact with no conflict", async () => {
    const { ws, a } = await setup();
    const c = await prisma.contact.create({
      data: { workspaceId: ws.id, ownerUserId: a.id, email: "x@x", instagramHandle: "x", displayName: "X" },
    });
    const r = await activateAgent({
      workspaceId: ws.id,
      actor: { id: a.id, role: "member" },
      contactId: c.id,
    });
    expect(r.ok).toBe(true);
    const fresh = await prisma.contact.findUnique({ where: { id: c.id } });
    expect(fresh!.agentActive).toBe(true);
  });

  it("blocks activation when colleague has same email active", async () => {
    const { ws, a, b } = await setup();
    await prisma.contact.create({
      data: {
        workspaceId: ws.id, ownerUserId: b.id,
        email: "shared@x", instagramHandle: "shared",
        displayName: "B", agentActive: true,
      },
    });
    const c = await prisma.contact.create({
      data: {
        workspaceId: ws.id, ownerUserId: a.id,
        email: "shared@x", instagramHandle: "shared",
        displayName: "A",
      },
    });
    const r = await activateAgent({
      workspaceId: ws.id,
      actor: { id: a.id, role: "member" },
      contactId: c.id,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.blockedBy).toBe("B");
    }
    const fresh = await prisma.contact.findUnique({ where: { id: c.id } });
    expect(fresh!.agentActive).toBe(false);
  });

  it("allows activation when colleague's matching contact is inactive", async () => {
    const { ws, a, b } = await setup();
    await prisma.contact.create({
      data: { workspaceId: ws.id, ownerUserId: b.id, email: "shared@x", instagramHandle: "shared", displayName: "B", agentActive: false },
    });
    const c = await prisma.contact.create({
      data: { workspaceId: ws.id, ownerUserId: a.id, email: "shared@x", instagramHandle: "shared", displayName: "A" },
    });
    const r = await activateAgent({
      workspaceId: ws.id,
      actor: { id: a.id, role: "member" },
      contactId: c.id,
    });
    expect(r.ok).toBe(true);
  });

  it("deactivation always succeeds", async () => {
    const { ws, a } = await setup();
    const c = await prisma.contact.create({
      data: { workspaceId: ws.id, ownerUserId: a.id, email: "x@x", instagramHandle: "x", displayName: "X", agentActive: true },
    });
    const r = await deactivateAgent({
      workspaceId: ws.id,
      actor: { id: a.id, role: "member" },
      contactId: c.id,
    });
    expect(r.ok).toBe(true);
  });

  it("member cannot toggle a colleague's contact", async () => {
    const { ws, a, b } = await setup();
    const c = await prisma.contact.create({
      data: { workspaceId: ws.id, ownerUserId: b.id, email: "x@x", instagramHandle: "x", displayName: "X" },
    });
    await expect(
      activateAgent({
        workspaceId: ws.id,
        actor: { id: a.id, role: "member" },
        contactId: c.id,
      })
    ).rejects.toThrow();
  });

  it("audit event is recorded for blocked activation", async () => {
    const { ws, a, b } = await setup();
    await prisma.contact.create({
      data: { workspaceId: ws.id, ownerUserId: b.id, email: "shared@x", instagramHandle: "shared", displayName: "B", agentActive: true },
    });
    const c = await prisma.contact.create({
      data: { workspaceId: ws.id, ownerUserId: a.id, email: "shared@x", instagramHandle: "shared", displayName: "A" },
    });
    await activateAgent({
      workspaceId: ws.id,
      actor: { id: a.id, role: "member" },
      contactId: c.id,
    });
    const events = await prisma.auditEvent.findMany();
    expect(events.some((e) => e.action === "contact.agent_active.activation_blocked")).toBe(true);
  });
});
