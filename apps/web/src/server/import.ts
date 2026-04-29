import { prisma } from "@/lib/db";
import { createHash } from "node:crypto";
import { z } from "zod";
import { parseImportFile, type ParsedRow } from "@/lib/excel";
import { normalizeInstagram } from "@/lib/instagram";

const emailSchema = z.string().email();

export type RejectionEntry = {
  rowNumber: number;
  reason: string;
  raw: Record<string, string>;
};

export type ColleagueWarning = {
  email: string;
  colleagueDisplayName: string;
};

type PlanState = "rejected" | "skipped_own" | "with_colleague" | "new";

type Plan = {
  row: ParsedRow;
  email: string;
  handle: string | null;
  handleUrl: string | null;
  state: PlanState;
  rejectionReason?: string;
  colleagueDisplayName?: string;
};

export async function performImport(input: {
  workspaceId: string;
  userId: string;
  filename: string;
  buffer: Uint8Array;
}) {
  const { workspaceId, userId, filename, buffer } = input;

  const fileHash = createHash("sha256").update(buffer).digest("hex");

  const { rows } = await parseImportFile(buffer);

  const ownExisting = await prisma.contact.findMany({
    where: { workspaceId, ownerUserId: userId, deletedAt: null },
    select: { email: true, instagramHandle: true },
  });
  const ownEmails = new Set(ownExisting.map((c) => c.email.toLowerCase()));
  const ownHandles = new Set(
    (ownExisting.map((c) => c.instagramHandle).filter(Boolean) as string[])
  );

  const plans: Plan[] = [];
  const rejections: RejectionEntry[] = [];
  const colleagueWarnings: ColleagueWarning[] = [];

  for (const row of rows) {
    const raw: Record<string, string> = {
      email: row.email,
      instagram_handle_or_url: row.instagram_handle_or_url,
      display_name: row.display_name,
    };
    const email = row.email.toLowerCase();

    if (!email || !row.instagram_handle_or_url || !row.display_name) {
      const missing = !email
        ? "email"
        : !row.instagram_handle_or_url
        ? "instagram_handle_or_url"
        : "display_name";
      const reason = `missing_required_field:${missing}`;
      rejections.push({ rowNumber: row.rowNumber, reason, raw });
      plans.push({
        row,
        email,
        handle: null,
        handleUrl: null,
        state: "rejected",
        rejectionReason: reason,
      });
      continue;
    }

    if (!emailSchema.safeParse(email).success) {
      rejections.push({ rowNumber: row.rowNumber, reason: "invalid_email", raw });
      plans.push({ row, email, handle: null, handleUrl: null, state: "rejected", rejectionReason: "invalid_email" });
      continue;
    }

    const ig = normalizeInstagram(row.instagram_handle_or_url);
    if (!ig) {
      rejections.push({ rowNumber: row.rowNumber, reason: "invalid_instagram", raw });
      plans.push({ row, email, handle: null, handleUrl: null, state: "rejected", rejectionReason: "invalid_instagram" });
      continue;
    }

    if (ownEmails.has(email) || ownHandles.has(ig.handle)) {
      plans.push({ row, email, handle: ig.handle, handleUrl: ig.url, state: "skipped_own" });
      continue;
    }

    const colleague = await prisma.contact.findFirst({
      where: {
        workspaceId,
        deletedAt: null,
        ownerUserId: { not: userId },
        OR: [{ email }, { instagramHandle: ig.handle }],
      },
      select: { owner: { select: { displayName: true } } },
    });

    if (colleague) {
      colleagueWarnings.push({
        email,
        colleagueDisplayName: colleague.owner.displayName,
      });
      plans.push({
        row,
        email,
        handle: ig.handle,
        handleUrl: ig.url,
        state: "with_colleague",
        colleagueDisplayName: colleague.owner.displayName,
      });
    } else {
      plans.push({ row, email, handle: ig.handle, handleUrl: ig.url, state: "new" });
    }

    ownEmails.add(email);
    ownHandles.add(ig.handle);
  }

  const counts = {
    new: plans.filter((p) => p.state === "new").length,
    withColleague: plans.filter((p) => p.state === "with_colleague").length,
    skippedOwn: plans.filter((p) => p.state === "skipped_own").length,
    rejected: plans.filter((p) => p.state === "rejected").length,
  };

  const result = await prisma.$transaction(async (tx) => {
    const batch = await tx.importBatch.create({
      data: {
        workspaceId,
        userId,
        filename,
        fileHash,
        rowsTotal: rows.length,
        rowsImportedNew: counts.new,
        rowsSkippedOwnDuplicate: counts.skippedOwn,
        rowsImportedWithColleagueWarning: counts.withColleague,
        rowsRejected: counts.rejected,
        rejectionReport: rejections,
      },
    });

    const toCreate = plans.filter((p) => p.state === "new" || p.state === "with_colleague");
    for (const p of toCreate) {
      await tx.contact.create({
        data: {
          workspaceId,
          ownerUserId: userId,
          email: p.email,
          instagramHandle: p.handle,
          instagramUrl: p.handleUrl,
          displayName: p.row.display_name,
          language: p.row.language || null,
          country: p.row.country || null,
          niche: p.row.niche || null,
          followersCount: p.row.followers_count ? Number(p.row.followers_count) || null : null,
          notes: p.row.notes || null,
          phone: p.row.phone || null,
          youtubeChannelName: p.row.youtube_channel_name || null,
          sourceImportBatchId: batch.id,
        },
      });
    }

    await tx.auditEvent.create({
      data: {
        workspaceId,
        actorUserId: userId,
        action: "import.completed",
        entityType: "import_batch",
        entityId: batch.id,
        payload: {
          filename,
          counts,
        },
      },
    });

    return { batch };
  });

  return {
    batch: result.batch,
    colleagueWarnings,
    rejections,
  };
}

export async function findPriorImportBatch(input: {
  userId: string;
  fileHash: string;
}) {
  return prisma.importBatch.findFirst({
    where: { userId: input.userId, fileHash: input.fileHash },
    orderBy: { createdAt: "desc" },
  });
}
