import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import {
  AUDIT_BRIEF_ARCHIVED,
  AUDIT_BRIEF_CREATED,
  AUDIT_BRIEF_UPDATED,
} from "@/lib/audit-actions";
import type { Role } from "@prisma/client";
import { z } from "zod";

export type AuthCtx = {
  workspaceId: string;
  userId: string;
  role: Role;
};

const isAdmin = (r: Role) => r === "admin" || r === "owner";

export const TONE_VALUES = ["friendly", "casual", "professional", "playful"] as const;

// Zod schema is the single validation boundary for brief inputs.
// Used by both create (full) and update (partial, via .partial()).
export const briefInputSchema = z.object({
  name: z.string().min(1, "name is required"),
  productDescription: z.string().min(1, "productDescription is required"),
  audienceOverlap: z.string().min(1, "audienceOverlap is required"),
  whyWorkWithUs: z.string().min(1, "whyWorkWithUs is required"),
  keyProductBenefits: z.string().min(1, "keyProductBenefits is required"),
  desiredFormat: z.string().min(1, "desiredFormat is required"),
  senderRole: z.string().min(1, "senderRole is required"),
  acceptsBarter: z.boolean().optional(),
  barterOffer: z.string().nullable().optional(),
  acceptsPaid: z.boolean().optional(),
  paidBudgetRange: z.string().nullable().optional(),
  toneOfVoice: z.enum(TONE_VALUES).optional(),
  letterLanguage: z.string().optional(),
  forbiddenPhrases: z.array(z.string()).optional(),
  noPriceFirstEmail: z.boolean().optional(),
  landingUrl: z
    .string()
    .nullable()
    .optional()
    .refine(
      (v) =>
        v == null || v === "" || v.startsWith("http://") || v.startsWith("https://"),
      { message: "landingUrl must use http or https" }
    ),
  promoCode: z.string().nullable().optional(),
});

export type BriefInput = z.infer<typeof briefInputSchema>;

export class BriefValidationError extends Error {
  constructor(
    message: string,
    readonly field?: string
  ) {
    super(message);
    this.name = "BriefValidationError";
  }
}

export class BriefForbiddenError extends Error {
  constructor() {
    super("forbidden");
    this.name = "BriefForbiddenError";
  }
}

function parseBriefInput(raw: unknown): BriefInput {
  const result = briefInputSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = String(issue.path[0] ?? "");
    throw new BriefValidationError(issue.message, field || undefined);
  }
  return result.data;
}

function parseBriefPatch(raw: unknown): Partial<BriefInput> {
  const result = briefInputSchema.partial().safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = String(issue.path[0] ?? "");
    throw new BriefValidationError(issue.message, field || undefined);
  }
  return result.data;
}

function canEdit(ctx: AuthCtx, brief: { createdByUserId: string }): boolean {
  return isAdmin(ctx.role) || brief.createdByUserId === ctx.userId;
}

export async function listBriefs(
  ctx: AuthCtx,
  opts: { archived?: boolean } = {}
) {
  return prisma.brief.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      ...(opts.archived !== undefined ? { archived: opts.archived } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { id: true, displayName: true } } },
  });
}

// Resolves regardless of archived flag — the worker reads briefs by id
// even after archiving (§5.2 + archive behavior: only hides from dropdown).
export async function getBriefById(ctx: AuthCtx, briefId: string) {
  return prisma.brief.findFirst({
    where: { id: briefId, workspaceId: ctx.workspaceId },
    include: { createdBy: { select: { id: true, displayName: true } } },
  });
}

export async function createBrief(ctx: AuthCtx, rawInput: unknown) {
  const input = parseBriefInput(rawInput);
  return prisma.$transaction(async (tx) => {
    const brief = await tx.brief.create({
      data: {
        workspaceId: ctx.workspaceId,
        createdByUserId: ctx.userId,
        name: input.name,
        productDescription: input.productDescription,
        audienceOverlap: input.audienceOverlap,
        whyWorkWithUs: input.whyWorkWithUs,
        keyProductBenefits: input.keyProductBenefits,
        desiredFormat: input.desiredFormat,
        senderRole: input.senderRole,
        acceptsBarter: input.acceptsBarter ?? true,
        barterOffer: input.barterOffer ?? null,
        acceptsPaid: input.acceptsPaid ?? false,
        paidBudgetRange: input.paidBudgetRange ?? null,
        toneOfVoice: input.toneOfVoice ?? "friendly",
        letterLanguage: input.letterLanguage ?? "auto",
        forbiddenPhrases: input.forbiddenPhrases ?? [],
        noPriceFirstEmail: input.noPriceFirstEmail ?? true,
        landingUrl: input.landingUrl ?? null,
        promoCode: input.promoCode ?? null,
      },
    });
    await writeAudit(tx, {
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: AUDIT_BRIEF_CREATED,
      entityType: "brief",
      entityId: brief.id,
      payload: { name: brief.name },
    });
    return brief;
  });
}

export async function updateBrief(
  ctx: AuthCtx,
  briefId: string,
  rawPatch: unknown
) {
  const patch = parseBriefPatch(rawPatch);
  return prisma.$transaction(async (tx) => {
    const target = await tx.brief.findFirst({
      where: { id: briefId, workspaceId: ctx.workspaceId },
    });
    if (!target) return null;
    if (!canEdit(ctx, target)) throw new BriefForbiddenError();

    // Build the merged shape and re-validate all required fields are still present.
    const merged = parseBriefInput({
      name: patch.name ?? target.name,
      productDescription: patch.productDescription ?? target.productDescription,
      audienceOverlap: patch.audienceOverlap ?? target.audienceOverlap,
      whyWorkWithUs: patch.whyWorkWithUs ?? target.whyWorkWithUs,
      keyProductBenefits: patch.keyProductBenefits ?? target.keyProductBenefits,
      desiredFormat: patch.desiredFormat ?? target.desiredFormat,
      senderRole: patch.senderRole ?? target.senderRole,
      acceptsBarter: patch.acceptsBarter ?? target.acceptsBarter,
      barterOffer: patch.barterOffer ?? target.barterOffer,
      acceptsPaid: patch.acceptsPaid ?? target.acceptsPaid,
      paidBudgetRange: patch.paidBudgetRange ?? target.paidBudgetRange,
      toneOfVoice: patch.toneOfVoice ?? target.toneOfVoice,
      letterLanguage: patch.letterLanguage ?? target.letterLanguage,
      forbiddenPhrases: patch.forbiddenPhrases ?? target.forbiddenPhrases,
      noPriceFirstEmail: patch.noPriceFirstEmail ?? target.noPriceFirstEmail,
      landingUrl: patch.landingUrl ?? target.landingUrl,
      promoCode: patch.promoCode ?? target.promoCode,
    });

    const updated = await tx.brief.update({
      where: { id: target.id },
      data: {
        name: merged.name,
        productDescription: merged.productDescription,
        audienceOverlap: merged.audienceOverlap,
        whyWorkWithUs: merged.whyWorkWithUs,
        keyProductBenefits: merged.keyProductBenefits,
        desiredFormat: merged.desiredFormat,
        senderRole: merged.senderRole,
        acceptsBarter: merged.acceptsBarter,
        barterOffer: merged.barterOffer ?? null,
        acceptsPaid: merged.acceptsPaid,
        paidBudgetRange: merged.paidBudgetRange ?? null,
        toneOfVoice: merged.toneOfVoice,
        letterLanguage: merged.letterLanguage,
        forbiddenPhrases: merged.forbiddenPhrases,
        noPriceFirstEmail: merged.noPriceFirstEmail,
        landingUrl: merged.landingUrl ?? null,
        promoCode: merged.promoCode ?? null,
      },
    });
    await writeAudit(tx, {
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: AUDIT_BRIEF_UPDATED,
      entityType: "brief",
      entityId: target.id,
      payload: { changedKeys: Object.keys(patch) },
    });
    return updated;
  });
}

export async function archiveBrief(ctx: AuthCtx, briefId: string) {
  return prisma.$transaction(async (tx) => {
    const target = await tx.brief.findFirst({
      where: { id: briefId, workspaceId: ctx.workspaceId },
    });
    if (!target) return null;
    if (!canEdit(ctx, target)) throw new BriefForbiddenError();
    if (target.archived) return target;

    const updated = await tx.brief.update({
      where: { id: target.id },
      data: { archived: true },
    });
    await writeAudit(tx, {
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: AUDIT_BRIEF_ARCHIVED,
      entityType: "brief",
      entityId: target.id,
      payload: { name: target.name },
    });
    return updated;
  });
}
