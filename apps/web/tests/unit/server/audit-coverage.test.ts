import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { createInvitation, acceptInvitation } from "@/server/invitations";
import { changeUserRole, deactivateUser } from "@/server/users";
import { softDeleteContact, updateContact } from "@/server/contacts";

async function reset() {
  await prisma.auditEvent.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.importBatch.deleteMany();
  await prisma.user.deleteMany();
  await prisma.workspace.deleteMany();
}

describe("audit coverage", () => {
  beforeEach(reset);

  it("records each mutation type", async () => {
    const ws = await prisma.workspace.create({ data: { name: "T" } });
    const owner = await prisma.user.create({
      data: { workspaceId: ws.id, email: "o@x", passwordHash: await hashPassword("x"), displayName: "O", role: "owner" },
    });
    const inv = await createInvitation({
      workspaceId: ws.id, actor: { id: owner.id, role: "owner" },
      email: "n@x", role: "member", expiryDays: 30,
    });
    const newUser = await acceptInvitation({ token: inv.token, displayName: "N", password: "passw0rd" });
    await changeUserRole({
      workspaceId: ws.id, actor: { role: "owner" },
      userId: newUser.id, newRole: "admin",
    });
    const c = await prisma.contact.create({
      data: { workspaceId: ws.id, ownerUserId: newUser.id, email: "c@x", displayName: "C" },
    });
    await updateContact(
      { workspaceId: ws.id, userId: newUser.id, role: "admin", contactId: c.id },
      { displayName: "C2" }
    );
    await softDeleteContact({ workspaceId: ws.id, userId: newUser.id, role: "admin", contactId: c.id });
    await deactivateUser({ workspaceId: ws.id, actor: { role: "owner" }, userId: newUser.id });

    const actions = (await prisma.auditEvent.findMany()).map((e) => e.action);
    for (const expected of [
      "user.invited",
      "user.joined",
      "user.role_changed",
      "contact.updated",
      "contact.deleted",
      "user.deactivated",
    ]) {
      expect(actions).toContain(expected);
    }
  });
});
