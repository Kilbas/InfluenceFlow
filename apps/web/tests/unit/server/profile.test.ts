import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  ProfileValidationError,
  WrongPasswordError,
  changePassword,
  getProfileForUser,
  getTodaySendCount,
  updateCalibration,
  updateDisplayName,
} from "@/server/profile";

async function setup() {
  await prisma.auditEvent.deleteMany();
  await prisma.sentEmail.deleteMany();
  await prisma.brief.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.user.deleteMany();
  await prisma.workspace.deleteMany();
  const ws = await prisma.workspace.create({ data: { name: "T" } });
  const user = await prisma.user.create({
    data: {
      workspaceId: ws.id,
      email: "u@x",
      passwordHash: await hashPassword("hunter22"),
      displayName: "U",
      role: "member",
      approvedLettersCount: 50,
      forcePreviewMode: false,
    },
  });
  return { ws, user };
}

describe("profile server module", () => {
  describe("updateCalibration", () => {
    it("toggles forcePreviewMode", async () => {
      const { user } = await setup();
      const updated = await updateCalibration({
        userId: user.id,
        patch: { forcePreviewMode: true },
      });
      expect(updated.forcePreviewMode).toBe(true);
      const off = await updateCalibration({
        userId: user.id,
        patch: { forcePreviewMode: false },
      });
      expect(off.forcePreviewMode).toBe(false);
    });

    it("resets the counter to 0", async () => {
      const { user } = await setup();
      const updated = await updateCalibration({
        userId: user.id,
        patch: { resetCounter: true },
      });
      expect(updated.approvedLettersCount).toBe(0);
    });

    it("rejects empty patch", async () => {
      const { user } = await setup();
      await expect(
        updateCalibration({ userId: user.id, patch: {} })
      ).rejects.toThrow(ProfileValidationError);
    });
  });

  describe("updateDisplayName", () => {
    it("updates display name", async () => {
      const { user } = await setup();
      const updated = await updateDisplayName({
        userId: user.id,
        patch: { displayName: "New Name" },
      });
      expect(updated.displayName).toBe("New Name");
    });

    it("rejects empty display name", async () => {
      const { user } = await setup();
      await expect(
        updateDisplayName({ userId: user.id, patch: { displayName: "" } })
      ).rejects.toThrow(ProfileValidationError);
    });
  });

  describe("changePassword", () => {
    it("changes password when current is correct", async () => {
      const { user } = await setup();
      await changePassword({
        userId: user.id,
        patch: { currentPassword: "hunter22", newPassword: "newhunter22" },
      });
      const fresh = await prisma.user.findUnique({ where: { id: user.id } });
      expect(await verifyPassword(fresh!.passwordHash, "newhunter22")).toBe(true);
    });

    it("rejects when current password is wrong", async () => {
      const { user } = await setup();
      await expect(
        changePassword({
          userId: user.id,
          patch: { currentPassword: "wrong", newPassword: "newhunter22" },
        })
      ).rejects.toThrow(WrongPasswordError);
    });

    it("rejects newPassword shorter than 8 chars", async () => {
      const { user } = await setup();
      await expect(
        changePassword({
          userId: user.id,
          patch: { currentPassword: "hunter22", newPassword: "short" },
        })
      ).rejects.toThrow(ProfileValidationError);
    });
  });

  describe("getProfileForUser", () => {
    it("returns the user without passwordHash", async () => {
      const { user } = await setup();
      const profile = await getProfileForUser(user.id);
      expect(profile).not.toBeNull();
      expect(profile as Record<string, unknown>).not.toHaveProperty("passwordHash");
      expect(profile!.email).toBe("u@x");
    });
  });

  describe("getTodaySendCount", () => {
    it("counts only today's approved/sending/sent letters", async () => {
      const { ws, user } = await setup();
      const contact = await prisma.contact.create({
        data: {
          workspaceId: ws.id,
          ownerUserId: user.id,
          email: "c@x",
          instagramHandle: "c",
          displayName: "C",
        },
      });
      const brief = await prisma.brief.create({
        data: {
          workspaceId: ws.id,
          createdByUserId: user.id,
          name: "B",
          productDescription: "p",
          audienceOverlap: "a",
          whyWorkWithUs: "w",
          keyProductBenefits: "k",
          desiredFormat: "d",
          senderRole: "r",
        },
      });
      // counted (today, sent)
      await prisma.sentEmail.create({
        data: {
          workspaceId: ws.id,
          contactId: contact.id,
          senderUserId: user.id,
          briefId: brief.id,
          status: "sent",
        },
      });
      // not counted (queued)
      await prisma.sentEmail.create({
        data: {
          workspaceId: ws.id,
          contactId: contact.id,
          senderUserId: user.id,
          briefId: brief.id,
          status: "queued",
        },
      });
      // not counted (yesterday)
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      await prisma.sentEmail.create({
        data: {
          workspaceId: ws.id,
          contactId: contact.id,
          senderUserId: user.id,
          briefId: brief.id,
          status: "sent",
          createdAt: yesterday,
        },
      });
      const count = await getTodaySendCount(user.id);
      expect(count).toBe(1);
    });
  });
});
