import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import {
  archiveBrief,
  BriefForbiddenError,
  BriefValidationError,
  createBrief,
  getBriefById,
  listBriefs,
  updateBrief,
  type BriefInput,
} from "@/server/briefs";

async function setup() {
  await prisma.auditEvent.deleteMany();
  await prisma.brief.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.importBatch.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.user.deleteMany();
  await prisma.workspace.deleteMany();
  const ws = await prisma.workspace.create({ data: { name: "T" } });
  const owner = await prisma.user.create({
    data: {
      workspaceId: ws.id,
      email: "owner@x",
      passwordHash: await hashPassword("x"),
      displayName: "Owner",
      role: "owner",
    },
  });
  const memberA = await prisma.user.create({
    data: {
      workspaceId: ws.id,
      email: "a@x",
      passwordHash: await hashPassword("x"),
      displayName: "Alice",
      role: "member",
    },
  });
  const memberB = await prisma.user.create({
    data: {
      workspaceId: ws.id,
      email: "b@x",
      passwordHash: await hashPassword("x"),
      displayName: "Bob",
      role: "member",
    },
  });
  return { ws, owner, memberA, memberB };
}

const validInput: BriefInput = {
  name: "Pillow Q2",
  productDescription: "Memory foam pillow.",
  audienceOverlap: "Wellness creators 20-35.",
  whyWorkWithUs: "We pay attention to comfort.",
  keyProductBenefits: "Cooling gel layer.",
  desiredFormat: "1 reel + 1 story.",
  senderRole: "Partnership Lead",
};

describe("briefs server module", () => {
  describe("createBrief", () => {
    it("creates a brief with defaults and writes audit", async () => {
      const { ws, memberA } = await setup();
      const brief = await createBrief(
        { workspaceId: ws.id, userId: memberA.id, role: "member" },
        validInput
      );
      expect(brief.name).toBe("Pillow Q2");
      expect(brief.acceptsBarter).toBe(true);
      expect(brief.acceptsPaid).toBe(false);
      expect(brief.toneOfVoice).toBe("friendly");
      expect(brief.letterLanguage).toBe("auto");
      expect(brief.archived).toBe(false);

      const audits = await prisma.auditEvent.findMany({
        where: { entityType: "brief", entityId: brief.id },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0].action).toBe("brief.created");
    });

    it("rejects missing required fields", async () => {
      const { ws, memberA } = await setup();
      await expect(
        createBrief(
          { workspaceId: ws.id, userId: memberA.id, role: "member" },
          { ...validInput, name: "" }
        )
      ).rejects.toThrow(BriefValidationError);
    });

    it("rejects invalid toneOfVoice", async () => {
      const { ws, memberA } = await setup();
      await expect(
        createBrief(
          { workspaceId: ws.id, userId: memberA.id, role: "member" },
          { ...validInput, toneOfVoice: "epic" as unknown as BriefInput["toneOfVoice"] }
        )
      ).rejects.toThrow(BriefValidationError);
    });

    it("rejects non-http landingUrl", async () => {
      const { ws, memberA } = await setup();
      await expect(
        createBrief(
          { workspaceId: ws.id, userId: memberA.id, role: "member" },
          { ...validInput, landingUrl: "javascript:alert(1)" }
        )
      ).rejects.toThrow(BriefValidationError);
    });

    it("accepts https landingUrl", async () => {
      const { ws, memberA } = await setup();
      const brief = await createBrief(
        { workspaceId: ws.id, userId: memberA.id, role: "member" },
        { ...validInput, landingUrl: "https://example.com" }
      );
      expect(brief.landingUrl).toBe("https://example.com");
    });

    it("rejects forbiddenPhrases with non-string elements", async () => {
      const { ws, memberA } = await setup();
      await expect(
        createBrief(
          { workspaceId: ws.id, userId: memberA.id, role: "member" },
          { ...validInput, forbiddenPhrases: [42, "ok"] as unknown as string[] }
        )
      ).rejects.toThrow(BriefValidationError);
    });
  });

  describe("listBriefs", () => {
    it("returns all briefs in workspace, scoped by archived flag", async () => {
      const { ws, memberA } = await setup();
      const ctx = { workspaceId: ws.id, userId: memberA.id, role: "member" as const };
      await createBrief(ctx, { ...validInput, name: "Active 1" });
      const b2 = await createBrief(ctx, { ...validInput, name: "Active 2" });
      await archiveBrief(ctx, b2.id);

      const all = await listBriefs(ctx);
      const active = await listBriefs(ctx, { archived: false });
      const archived = await listBriefs(ctx, { archived: true });

      expect(all).toHaveLength(2);
      expect(active).toHaveLength(1);
      expect(active[0].name).toBe("Active 1");
      expect(archived).toHaveLength(1);
      expect(archived[0].name).toBe("Active 2");
    });

    it("is scoped by workspace", async () => {
      const { ws, memberA } = await setup();
      const ws2 = await prisma.workspace.create({ data: { name: "Other" } });
      await createBrief(
        { workspaceId: ws.id, userId: memberA.id, role: "member" },
        validInput
      );
      const result = await listBriefs({
        workspaceId: ws2.id,
        userId: memberA.id,
        role: "owner",
      });
      expect(result).toHaveLength(0);
    });
  });

  describe("getBriefById", () => {
    it("resolves an archived brief by id (worker read path)", async () => {
      const { ws, memberA } = await setup();
      const ctx = { workspaceId: ws.id, userId: memberA.id, role: "member" as const };
      const created = await createBrief(ctx, validInput);
      await archiveBrief(ctx, created.id);
      const fetched = await getBriefById(ctx, created.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.archived).toBe(true);
    });

    it("returns null for a brief in another workspace", async () => {
      const { ws, memberA } = await setup();
      const ws2 = await prisma.workspace.create({ data: { name: "Other" } });
      const created = await createBrief(
        { workspaceId: ws.id, userId: memberA.id, role: "member" },
        validInput
      );
      const result = await getBriefById(
        { workspaceId: ws2.id, userId: memberA.id, role: "owner" },
        created.id
      );
      expect(result).toBeNull();
    });
  });

  describe("updateBrief permissions", () => {
    it("allows the original creator to update", async () => {
      const { ws, memberA } = await setup();
      const ctx = { workspaceId: ws.id, userId: memberA.id, role: "member" as const };
      const created = await createBrief(ctx, validInput);
      const updated = await updateBrief(ctx, created.id, { name: "Renamed" });
      expect(updated!.name).toBe("Renamed");

      const audits = await prisma.auditEvent.findMany({
        where: { entityType: "brief", entityId: created.id, action: "brief.updated" },
      });
      expect(audits).toHaveLength(1);
    });

    it("forbids a different member from editing", async () => {
      const { ws, memberA, memberB } = await setup();
      const created = await createBrief(
        { workspaceId: ws.id, userId: memberA.id, role: "member" },
        validInput
      );
      await expect(
        updateBrief(
          { workspaceId: ws.id, userId: memberB.id, role: "member" },
          created.id,
          { name: "Hijack" }
        )
      ).rejects.toThrow(BriefForbiddenError);
    });

    it("allows owner to edit any brief", async () => {
      const { ws, memberA, owner } = await setup();
      const created = await createBrief(
        { workspaceId: ws.id, userId: memberA.id, role: "member" },
        validInput
      );
      const updated = await updateBrief(
        { workspaceId: ws.id, userId: owner.id, role: "owner" },
        created.id,
        { name: "Owner-renamed" }
      );
      expect(updated!.name).toBe("Owner-renamed");
    });

    it("allows admin to edit any brief", async () => {
      const { ws, memberA, memberB } = await setup();
      // promote memberB to admin
      await prisma.user.update({ where: { id: memberB.id }, data: { role: "admin" } });
      const created = await createBrief(
        { workspaceId: ws.id, userId: memberA.id, role: "member" },
        validInput
      );
      const updated = await updateBrief(
        { workspaceId: ws.id, userId: memberB.id, role: "admin" },
        created.id,
        { name: "Admin-renamed" }
      );
      expect(updated!.name).toBe("Admin-renamed");
    });

    it("cross-workspace: returns null (not Forbidden) for another workspace's brief", async () => {
      const { ws, memberA } = await setup();
      const ws2 = await prisma.workspace.create({ data: { name: "Other" } });
      const created = await createBrief(
        { workspaceId: ws.id, userId: memberA.id, role: "member" },
        validInput
      );
      // attacker from ws2 cannot even see ws1's brief
      const result = await updateBrief(
        { workspaceId: ws2.id, userId: memberA.id, role: "owner" },
        created.id,
        { name: "Hijack" }
      );
      expect(result).toBeNull();
    });

    it("returns null for unknown brief id", async () => {
      const { ws, memberA } = await setup();
      const result = await updateBrief(
        { workspaceId: ws.id, userId: memberA.id, role: "member" },
        "00000000-0000-0000-0000-000000000000",
        { name: "x" }
      );
      expect(result).toBeNull();
    });

    it("validates merged shape — required fields cannot be cleared", async () => {
      const { ws, memberA } = await setup();
      const ctx = { workspaceId: ws.id, userId: memberA.id, role: "member" as const };
      const created = await createBrief(ctx, validInput);
      await expect(updateBrief(ctx, created.id, { name: "" })).rejects.toThrow(
        BriefValidationError
      );
    });
  });

  describe("archiveBrief", () => {
    it("archives by creator, writes audit", async () => {
      const { ws, memberA } = await setup();
      const ctx = { workspaceId: ws.id, userId: memberA.id, role: "member" as const };
      const created = await createBrief(ctx, validInput);
      const archived = await archiveBrief(ctx, created.id);
      expect(archived!.archived).toBe(true);

      const audits = await prisma.auditEvent.findMany({
        where: { entityType: "brief", entityId: created.id, action: "brief.archived" },
      });
      expect(audits).toHaveLength(1);
    });

    it("forbids a different member from archiving", async () => {
      const { ws, memberA, memberB } = await setup();
      const created = await createBrief(
        { workspaceId: ws.id, userId: memberA.id, role: "member" },
        validInput
      );
      await expect(
        archiveBrief(
          { workspaceId: ws.id, userId: memberB.id, role: "member" },
          created.id
        )
      ).rejects.toThrow(BriefForbiddenError);
    });

    it("cross-workspace: returns null for another workspace's brief", async () => {
      const { ws, memberA } = await setup();
      const ws2 = await prisma.workspace.create({ data: { name: "Other" } });
      const created = await createBrief(
        { workspaceId: ws.id, userId: memberA.id, role: "member" },
        validInput
      );
      const result = await archiveBrief(
        { workspaceId: ws2.id, userId: memberA.id, role: "owner" },
        created.id
      );
      expect(result).toBeNull();
    });

    it("is idempotent on already-archived brief (no extra audit)", async () => {
      const { ws, memberA } = await setup();
      const ctx = { workspaceId: ws.id, userId: memberA.id, role: "member" as const };
      const created = await createBrief(ctx, validInput);
      await archiveBrief(ctx, created.id);
      await archiveBrief(ctx, created.id);
      const audits = await prisma.auditEvent.findMany({
        where: { entityType: "brief", entityId: created.id, action: "brief.archived" },
      });
      expect(audits).toHaveLength(1);
    });
  });
});
