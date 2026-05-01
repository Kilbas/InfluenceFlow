import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import {
  SettingsForbiddenError,
  SettingsValidationError,
  getOrCreateSettings,
  updateSettings,
} from "@/server/workspace-settings";

async function setup() {
  await prisma.auditEvent.deleteMany();
  await prisma.workspaceSettings.deleteMany();
  await prisma.brief.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.user.deleteMany();
  await prisma.workspace.deleteMany();
  const ws = await prisma.workspace.create({ data: { name: "T" } });
  const owner = await prisma.user.create({
    data: {
      workspaceId: ws.id,
      email: "o@x",
      passwordHash: await hashPassword("x"),
      displayName: "O",
      role: "owner",
    },
  });
  const member = await prisma.user.create({
    data: {
      workspaceId: ws.id,
      email: "m@x",
      passwordHash: await hashPassword("x"),
      displayName: "M",
      role: "member",
    },
  });
  return { ws, owner, member };
}

describe("workspace-settings server module", () => {
  describe("getOrCreateSettings", () => {
    it("creates a row with defaults on first read", async () => {
      const { ws, member } = await setup();
      const settings = await getOrCreateSettings({
        workspaceId: ws.id,
        userId: member.id,
        role: "member",
      });
      expect(settings.workspaceId).toBe(ws.id);
      expect(settings.letterModel).toBe("claude-sonnet-4-6");
      expect(settings.summarizeModel).toBe("claude-haiku-4-5");
      expect(settings.calibrationThreshold).toBe(100);
      expect(settings.rateLimitPerMember).toBe(50);
      expect(settings.trackingEnabled).toBe(true);
    });

    it("returns the existing row on subsequent reads", async () => {
      const { ws, member } = await setup();
      const ctx = { workspaceId: ws.id, userId: member.id, role: "member" as const };
      const first = await getOrCreateSettings(ctx);
      const second = await getOrCreateSettings(ctx);
      expect(first.workspaceId).toBe(second.workspaceId);
      const count = await prisma.workspaceSettings.count({
        where: { workspaceId: ws.id },
      });
      expect(count).toBe(1);
    });
  });

  describe("updateSettings", () => {
    it("forbids non-admin", async () => {
      const { ws, member } = await setup();
      await expect(
        updateSettings(
          { workspaceId: ws.id, userId: member.id, role: "member" },
          { rateLimitPerMember: 100 }
        )
      ).rejects.toThrow(SettingsForbiddenError);
    });

    it("allows owner to update and writes audit with diff", async () => {
      const { ws, owner } = await setup();
      await getOrCreateSettings({
        workspaceId: ws.id,
        userId: owner.id,
        role: "owner",
      });
      const updated = await updateSettings(
        { workspaceId: ws.id, userId: owner.id, role: "owner" },
        { rateLimitPerMember: 75, calibrationThreshold: 200 }
      );
      expect(updated.rateLimitPerMember).toBe(75);
      expect(updated.calibrationThreshold).toBe(200);

      const audits = await prisma.auditEvent.findMany({
        where: { entityType: "workspace_settings", action: "workspace_settings.updated" },
      });
      expect(audits).toHaveLength(1);
      const payload = audits[0].payload as { diff: Record<string, { from: number; to: number }> };
      expect(payload.diff.rateLimitPerMember).toEqual({ from: 50, to: 75 });
      expect(payload.diff.calibrationThreshold).toEqual({ from: 100, to: 200 });
    });

    it("does NOT audit when patch is a no-op", async () => {
      const { ws, owner } = await setup();
      const before = await getOrCreateSettings({
        workspaceId: ws.id,
        userId: owner.id,
        role: "owner",
      });
      await updateSettings(
        { workspaceId: ws.id, userId: owner.id, role: "owner" },
        { rateLimitPerMember: before.rateLimitPerMember }
      );
      const audits = await prisma.auditEvent.findMany({
        where: { entityType: "workspace_settings" },
      });
      expect(audits).toHaveLength(0);
    });

    it("rejects invalid letterModel", async () => {
      const { ws, owner } = await setup();
      await expect(
        updateSettings(
          { workspaceId: ws.id, userId: owner.id, role: "owner" },
          { letterModel: "gpt-4" }
        )
      ).rejects.toThrow(SettingsValidationError);
    });

    it("rejects invalid summarizeModel (e.g. opus)", async () => {
      const { ws, owner } = await setup();
      await expect(
        updateSettings(
          { workspaceId: ws.id, userId: owner.id, role: "owner" },
          { summarizeModel: "claude-opus-4-7" }
        )
      ).rejects.toThrow(SettingsValidationError);
    });

    it("rejects rateLimitPerMember out of range", async () => {
      const { ws, owner } = await setup();
      await expect(
        updateSettings(
          { workspaceId: ws.id, userId: owner.id, role: "owner" },
          { rateLimitPerMember: 0 }
        )
      ).rejects.toThrow(SettingsValidationError);
    });

    it("rejects defaultBriefId from another workspace", async () => {
      const { ws, owner } = await setup();
      const otherWs = await prisma.workspace.create({ data: { name: "Other" } });
      const otherUser = await prisma.user.create({
        data: {
          workspaceId: otherWs.id,
          email: "o2@x",
          passwordHash: await hashPassword("x"),
          displayName: "O2",
          role: "owner",
        },
      });
      const foreignBrief = await prisma.brief.create({
        data: {
          workspaceId: otherWs.id,
          createdByUserId: otherUser.id,
          name: "Foreign",
          productDescription: "p",
          audienceOverlap: "a",
          whyWorkWithUs: "w",
          keyProductBenefits: "k",
          desiredFormat: "d",
          senderRole: "r",
        },
      });
      await expect(
        updateSettings(
          { workspaceId: ws.id, userId: owner.id, role: "owner" },
          { defaultBriefId: foreignBrief.id }
        )
      ).rejects.toThrow(SettingsValidationError);
    });

    it("accepts a valid defaultBriefId in the same workspace", async () => {
      const { ws, owner } = await setup();
      const brief = await prisma.brief.create({
        data: {
          workspaceId: ws.id,
          createdByUserId: owner.id,
          name: "Mine",
          productDescription: "p",
          audienceOverlap: "a",
          whyWorkWithUs: "w",
          keyProductBenefits: "k",
          desiredFormat: "d",
          senderRole: "r",
        },
      });
      const updated = await updateSettings(
        { workspaceId: ws.id, userId: owner.id, role: "owner" },
        { defaultBriefId: brief.id }
      );
      expect(updated.defaultBriefId).toBe(brief.id);
    });

    it("workspace isolation: ws1 admin cannot affect ws2 settings", async () => {
      const { ws, owner } = await setup();
      const ws2 = await prisma.workspace.create({ data: { name: "Other" } });
      // create ws2 settings row first so we can detect later that nothing changed there
      await prisma.workspaceSettings.create({
        data: { workspaceId: ws2.id, rateLimitPerMember: 999 },
      });
      // ws1 owner runs an update — its ctx.workspaceId is ws1, so only ws1 row is touched
      await updateSettings(
        { workspaceId: ws.id, userId: owner.id, role: "owner" },
        { rateLimitPerMember: 42 }
      );
      const ws1Row = await prisma.workspaceSettings.findUnique({
        where: { workspaceId: ws.id },
      });
      const ws2Row = await prisma.workspaceSettings.findUnique({
        where: { workspaceId: ws2.id },
      });
      expect(ws1Row!.rateLimitPerMember).toBe(42);
      expect(ws2Row!.rateLimitPerMember).toBe(999);
    });

    it("accepts null defaultBriefId (clears the setting)", async () => {
      const { ws, owner } = await setup();
      const brief = await prisma.brief.create({
        data: {
          workspaceId: ws.id,
          createdByUserId: owner.id,
          name: "Mine",
          productDescription: "p",
          audienceOverlap: "a",
          whyWorkWithUs: "w",
          keyProductBenefits: "k",
          desiredFormat: "d",
          senderRole: "r",
        },
      });
      await updateSettings(
        { workspaceId: ws.id, userId: owner.id, role: "owner" },
        { defaultBriefId: brief.id }
      );
      const cleared = await updateSettings(
        { workspaceId: ws.id, userId: owner.id, role: "owner" },
        { defaultBriefId: null }
      );
      expect(cleared.defaultBriefId).toBeNull();
    });
  });
});
