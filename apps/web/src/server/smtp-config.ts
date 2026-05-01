import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import {
  AUDIT_MEMBER_SMTP_CONFIGURED,
  AUDIT_MEMBER_SMTP_TESTED,
} from "@/lib/audit-actions";
import { encrypt } from "@/lib/encryption";
import { z } from "zod";
import nodemailer from "nodemailer";

export const smtpInputSchema = z.object({
  host: z.string().min(1, "host is required"),
  port: z.number().int().min(1).max(65535),
  username: z.string().min(1, "username is required"),
  password: z.string().min(1, "password is required"),
  senderName: z.string().min(1, "senderName is required"),
  senderEmail: z.string().email("senderEmail must be a valid email"),
});

export type SmtpInput = z.infer<typeof smtpInputSchema>;

export class SmtpValidationError extends Error {
  constructor(
    message: string,
    readonly field?: string
  ) {
    super(message);
    this.name = "SmtpValidationError";
  }
}

export class SmtpConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmtpConnectionError";
  }
}

function parseInput(raw: unknown): SmtpInput {
  const result = smtpInputSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new SmtpValidationError(
      issue.message,
      String(issue.path[0] ?? "") || undefined
    );
  }
  return result.data;
}

// Public-safe view of the SMTP row (password and username masked).
export async function getMemberSmtpForUser(userId: string) {
  const row = await prisma.memberSmtp.findUnique({ where: { userId } });
  if (!row) return null;
  return {
    userId: row.userId,
    host: row.host,
    port: row.port,
    username: row.username,
    senderName: row.senderName,
    senderEmail: row.senderEmail,
    isActive: row.isActive,
    testedAt: row.testedAt,
    updatedAt: row.updatedAt,
  };
}

type VerifyTransport = (input: SmtpInput) => Promise<void>;

const defaultVerify: VerifyTransport = async (input) => {
  const transporter = nodemailer.createTransport({
    host: input.host,
    port: input.port,
    secure: input.port === 465,
    auth: { user: input.username, pass: input.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
  });
  await transporter.verify();
};

// Test + persist. Verify must succeed before any DB write.
// Audits both `member_smtp.tested` (always on success) and
// `member_smtp.configured` (when row is created or non-credential
// fields changed).
export async function testAndSaveMemberSmtp(opts: {
  workspaceId: string;
  userId: string;
  input: unknown;
  // Injectable for tests.
  verify?: VerifyTransport;
}) {
  const input = parseInput(opts.input);
  const verify = opts.verify ?? defaultVerify;

  try {
    await verify(input);
  } catch (err) {
    throw new SmtpConnectionError(
      err instanceof Error ? err.message : "SMTP connection failed"
    );
  }

  const passwordEncrypted = encrypt(input.password);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.memberSmtp.findUnique({
      where: { userId: opts.userId },
    });

    const data = {
      host: input.host,
      port: input.port,
      username: input.username,
      passwordEncrypted,
      senderName: input.senderName,
      senderEmail: input.senderEmail,
      isActive: true,
      testedAt: new Date(),
    };

    const row = existing
      ? await tx.memberSmtp.update({
          where: { userId: opts.userId },
          data,
        })
      : await tx.memberSmtp.create({
          data: { userId: opts.userId, ...data },
        });

    const isNewOrConfigChanged =
      !existing ||
      existing.host !== input.host ||
      existing.port !== input.port ||
      existing.username !== input.username ||
      existing.senderName !== input.senderName ||
      existing.senderEmail !== input.senderEmail;

    await writeAudit(tx, {
      workspaceId: opts.workspaceId,
      actorUserId: opts.userId,
      action: AUDIT_MEMBER_SMTP_TESTED,
      entityType: "member_smtp",
      entityId: opts.userId,
    });
    if (isNewOrConfigChanged) {
      await writeAudit(tx, {
        workspaceId: opts.workspaceId,
        actorUserId: opts.userId,
        action: AUDIT_MEMBER_SMTP_CONFIGURED,
        entityType: "member_smtp",
        entityId: opts.userId,
        payload: {
          host: input.host,
          port: input.port,
          senderEmail: input.senderEmail,
        },
      });
    }

    return {
      userId: row.userId,
      host: row.host,
      port: row.port,
      username: row.username,
      senderName: row.senderName,
      senderEmail: row.senderEmail,
      isActive: row.isActive,
      testedAt: row.testedAt,
      updatedAt: row.updatedAt,
    };
  });
}
