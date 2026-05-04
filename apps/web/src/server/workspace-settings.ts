import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { AUDIT_WORKSPACE_SETTINGS_UPDATED } from "@/lib/audit-actions";
import type { Role } from "@prisma/client";
import { z } from "zod";
import { LETTER_MODELS, SUMMARIZE_MODELS } from "@/lib/model-constants";

export type AuthCtx = {
  workspaceId: string;
  userId: string;
  role: Role;
};

const isAdmin = (r: Role) => r === "admin" || r === "owner";

export const settingsPatchSchema = z.object({
  letterModel: z.enum(LETTER_MODELS).optional(),
  summarizeModel: z.enum(SUMMARIZE_MODELS).optional(),
  trackingEnabled: z.boolean().optional(),
  rateLimitPerMember: z.number().int().min(1).max(10000).optional(),
  calibrationThreshold: z.number().int().min(0).max(10000).optional(),
  defaultBriefId: z.string().uuid().nullable().optional(),
});

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export class SettingsValidationError extends Error {
  constructor(
    message: string,
    readonly field?: string
  ) {
    super(message);
    this.name = "SettingsValidationError";
  }
}

export class SettingsForbiddenError extends Error {
  constructor() {
    super("forbidden");
    this.name = "SettingsForbiddenError";
  }
}

// Read-or-create. Auto-creates the row from schema defaults if absent
// so members never see a 404 on first load (plan M3.3). Uses upsert to
// be safe under concurrent first-loads.
export async function getOrCreateSettings(ctx: AuthCtx) {
  return prisma.workspaceSettings.upsert({
    where: { workspaceId: ctx.workspaceId },
    create: { workspaceId: ctx.workspaceId },
    update: {},
  });
}

export async function updateSettings(ctx: AuthCtx, rawPatch: unknown) {
  if (!isAdmin(ctx.role)) throw new SettingsForbiddenError();

  const result = settingsPatchSchema.safeParse(rawPatch);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new SettingsValidationError(
      issue.message,
      String(issue.path[0] ?? "") || undefined
    );
  }
  const patch = result.data;

  if (patch.defaultBriefId) {
    const brief = await prisma.brief.findFirst({
      where: { id: patch.defaultBriefId, workspaceId: ctx.workspaceId },
    });
    if (!brief)
      throw new SettingsValidationError(
        "defaultBriefId does not exist in this workspace",
        "defaultBriefId"
      );
  }

  // Concurrent admin patches resolve last-writer-wins; the audit diff
  // captures from→to relative to whatever the row contained when this
  // transaction read it. Acceptable for self-hosted single-tenant.
  return prisma.$transaction(async (tx) => {
    const before = await tx.workspaceSettings.upsert({
      where: { workspaceId: ctx.workspaceId },
      create: { workspaceId: ctx.workspaceId },
      update: {},
    });

    const updated = await tx.workspaceSettings.update({
      where: { workspaceId: ctx.workspaceId },
      data: patch,
    });

    const diff: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(patch) as (keyof SettingsPatch)[]) {
      const fromVal = before[key as keyof typeof before];
      const toVal = updated[key as keyof typeof updated];
      if (fromVal !== toVal) diff[key] = { from: fromVal, to: toVal };
    }

    if (Object.keys(diff).length > 0) {
      await writeAudit(tx, {
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        action: AUDIT_WORKSPACE_SETTINGS_UPDATED,
        entityType: "workspace_settings",
        entityId: ctx.workspaceId,
        payload: { diff },
      });
    }

    return updated;
  });
}
