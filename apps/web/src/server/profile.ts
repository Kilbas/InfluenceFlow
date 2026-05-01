import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { z } from "zod";

export const calibrationPatchSchema = z
  .object({
    forcePreviewMode: z.boolean().optional(),
    resetCounter: z.boolean().optional(),
  })
  .refine((v) => v.forcePreviewMode !== undefined || v.resetCounter === true, {
    message: "no fields to update",
  });

export type CalibrationPatch = z.infer<typeof calibrationPatchSchema>;

export class ProfileValidationError extends Error {
  constructor(
    message: string,
    readonly field?: string
  ) {
    super(message);
    this.name = "ProfileValidationError";
  }
}

export class WrongPasswordError extends Error {
  constructor() {
    super("current password is incorrect");
    this.name = "WrongPasswordError";
  }
}

export async function getProfileForUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      approvedLettersCount: true,
      forcePreviewMode: true,
      workspaceId: true,
    },
  });
  return user;
}

export async function updateCalibration(opts: {
  userId: string;
  patch: unknown;
}) {
  const result = calibrationPatchSchema.safeParse(opts.patch);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ProfileValidationError(
      issue.message,
      String(issue.path[0] ?? "") || undefined
    );
  }
  const patch = result.data;

  return prisma.user.update({
    where: { id: opts.userId },
    data: {
      ...(patch.forcePreviewMode !== undefined
        ? { forcePreviewMode: patch.forcePreviewMode }
        : {}),
      ...(patch.resetCounter ? { approvedLettersCount: 0 } : {}),
    },
    select: {
      id: true,
      approvedLettersCount: true,
      forcePreviewMode: true,
    },
  });
}

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "currentPassword is required"),
  newPassword: z.string().min(8, "newPassword must be at least 8 characters"),
});

export async function changePassword(opts: {
  userId: string;
  patch: unknown;
}) {
  const result = passwordChangeSchema.safeParse(opts.patch);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ProfileValidationError(
      issue.message,
      String(issue.path[0] ?? "") || undefined
    );
  }
  const { currentPassword, newPassword } = result.data;

  const user = await prisma.user.findUnique({ where: { id: opts.userId } });
  if (!user) throw new ProfileValidationError("user not found");

  const ok = await verifyPassword(user.passwordHash, currentPassword);
  if (!ok) throw new WrongPasswordError();

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: opts.userId },
    data: { passwordHash },
  });
  return { ok: true };
}

export const displayNamePatchSchema = z.object({
  displayName: z.string().min(1, "displayName is required").max(100),
});

export async function updateDisplayName(opts: {
  userId: string;
  patch: unknown;
}) {
  const result = displayNamePatchSchema.safeParse(opts.patch);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ProfileValidationError(
      issue.message,
      String(issue.path[0] ?? "") || undefined
    );
  }
  return prisma.user.update({
    where: { id: opts.userId },
    data: { displayName: result.data.displayName },
    select: { id: true, displayName: true },
  });
}

// Read-only daily-send count for member, used to display rate-limit usage
// in the profile UI. Matches the rate-limit query in spec §7.5: counts
// approved/sending/sent rows by `created_at` in UTC. Using `created_at`
// (not `sent_at`) is intentional so a queued-but-not-yet-sent letter still
// counts toward today's quota at enqueue time.
export async function getTodaySendCount(userId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  return prisma.sentEmail.count({
    where: {
      senderUserId: userId,
      status: { in: ["approved", "sending", "sent"] },
      createdAt: { gte: startOfDay },
    },
  });
}
