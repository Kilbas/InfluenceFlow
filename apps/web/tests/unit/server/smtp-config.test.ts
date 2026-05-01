import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { decrypt } from "@/lib/encryption";
import {
  SmtpConnectionError,
  SmtpValidationError,
  getMemberSmtpForUser,
  testAndSaveMemberSmtp,
} from "@/server/smtp-config";

const VALID_KEY = "a".repeat(64);

beforeEach(() => {
  process.env.ENCRYPTION_KEY = VALID_KEY;
});
afterEach(() => {
  delete process.env.ENCRYPTION_KEY;
});

async function setup() {
  await prisma.auditEvent.deleteMany();
  await prisma.memberSmtp.deleteMany();
  await prisma.brief.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.user.deleteMany();
  await prisma.workspace.deleteMany();
  const ws = await prisma.workspace.create({ data: { name: "T" } });
  const user = await prisma.user.create({
    data: {
      workspaceId: ws.id,
      email: "u@x",
      passwordHash: await hashPassword("x"),
      displayName: "U",
      role: "member",
    },
  });
  return { ws, user };
}

const validInput = {
  host: "smtp.example.com",
  port: 587,
  username: "user",
  password: "secret-pwd",
  senderName: "User U",
  senderEmail: "u@example.com",
};

describe("smtp-config server module", () => {
  it("rejects invalid input shape", async () => {
    const { ws, user } = await setup();
    await expect(
      testAndSaveMemberSmtp({
        workspaceId: ws.id,
        userId: user.id,
        input: { ...validInput, port: 99999 },
        verify: vi.fn(),
      })
    ).rejects.toThrow(SmtpValidationError);
    await expect(
      testAndSaveMemberSmtp({
        workspaceId: ws.id,
        userId: user.id,
        input: { ...validInput, senderEmail: "not-an-email" },
        verify: vi.fn(),
      })
    ).rejects.toThrow(SmtpValidationError);
  });

  it("does NOT persist credentials when verify fails", async () => {
    const { ws, user } = await setup();
    const verify = vi.fn().mockRejectedValue(new Error("auth failed"));
    await expect(
      testAndSaveMemberSmtp({
        workspaceId: ws.id,
        userId: user.id,
        input: validInput,
        verify,
      })
    ).rejects.toThrow(SmtpConnectionError);
    const row = await prisma.memberSmtp.findUnique({ where: { userId: user.id } });
    expect(row).toBeNull();
  });

  it("encrypts password (never plaintext) and audits both events on first save", async () => {
    const { ws, user } = await setup();
    const verify = vi.fn().mockResolvedValue(undefined);
    const result = await testAndSaveMemberSmtp({
      workspaceId: ws.id,
      userId: user.id,
      input: validInput,
      verify,
    });
    expect(result.isActive).toBe(true);
    expect(result.testedAt).toBeInstanceOf(Date);

    const row = await prisma.memberSmtp.findUnique({ where: { userId: user.id } });
    expect(row).not.toBeNull();
    expect(row!.passwordEncrypted).not.toBe("secret-pwd");
    expect(row!.passwordEncrypted).not.toContain("secret-pwd");
    expect(decrypt(row!.passwordEncrypted)).toBe("secret-pwd");

    const audits = await prisma.auditEvent.findMany({
      where: { entityType: "member_smtp", entityId: user.id },
      orderBy: { createdAt: "asc" },
    });
    const actions = audits.map((a) => a.action).sort();
    expect(actions).toEqual(["member_smtp.configured", "member_smtp.tested"]);
  });

  it("only emits member_smtp.tested when re-saving identical config", async () => {
    const { ws, user } = await setup();
    const verify = vi.fn().mockResolvedValue(undefined);
    await testAndSaveMemberSmtp({
      workspaceId: ws.id,
      userId: user.id,
      input: validInput,
      verify,
    });
    await prisma.auditEvent.deleteMany();
    await testAndSaveMemberSmtp({
      workspaceId: ws.id,
      userId: user.id,
      input: validInput,
      verify,
    });
    const audits = await prisma.auditEvent.findMany({
      where: { entityType: "member_smtp", entityId: user.id },
    });
    expect(audits.map((a) => a.action)).toEqual(["member_smtp.tested"]);
  });

  it("emits member_smtp.configured again when host/port/sender changes", async () => {
    const { ws, user } = await setup();
    const verify = vi.fn().mockResolvedValue(undefined);
    await testAndSaveMemberSmtp({
      workspaceId: ws.id,
      userId: user.id,
      input: validInput,
      verify,
    });
    await prisma.auditEvent.deleteMany();
    await testAndSaveMemberSmtp({
      workspaceId: ws.id,
      userId: user.id,
      input: { ...validInput, host: "smtp.other.com" },
      verify,
    });
    const actions = (
      await prisma.auditEvent.findMany({
        where: { entityType: "member_smtp", entityId: user.id },
      })
    )
      .map((a) => a.action)
      .sort();
    expect(actions).toEqual(["member_smtp.configured", "member_smtp.tested"]);
  });

  it("getMemberSmtpForUser strips password fields", async () => {
    const { ws, user } = await setup();
    const verify = vi.fn().mockResolvedValue(undefined);
    await testAndSaveMemberSmtp({
      workspaceId: ws.id,
      userId: user.id,
      input: validInput,
      verify,
    });
    const view = await getMemberSmtpForUser(user.id);
    expect(view).not.toBeNull();
    expect(view as Record<string, unknown>).not.toHaveProperty("passwordEncrypted");
    expect(view as Record<string, unknown>).not.toHaveProperty("password");
    expect(view!.isActive).toBe(true);
  });

  it("returns null for users without smtp", async () => {
    const { user } = await setup();
    const view = await getMemberSmtpForUser(user.id);
    expect(view).toBeNull();
  });
});
