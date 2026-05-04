import {
  generateJson,
  validateLetterOutput,
  TransientLLMError,
  ValidationError,
  MalformedJsonError,
  type ContentBlock,
} from "@/lib/llm";
import { getSendEmailQueue } from "./send-queue";
import { prisma } from "./db";
import { writeAudit } from "./audit";
import { ensureFreshWebContext } from "./web-context";
import { buildSystemPrompt, buildUserPrompt } from "./prompts";

// Exponential backoff delays for transient LLM errors (spec §6.4: 2s, 4s, 8s)
const TRANSIENT_BACKOFF_MS = [2000, 4000, 8000];
const MAX_TRANSIENT_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildCorrectiveUserBlocks(
  original: ContentBlock[],
  errorMsg: string
): ContentBlock[] {
  return [
    ...original,
    {
      type: "text",
      text: `The previous response was invalid: ${errorMsg}. Return strict JSON only, matching exactly:\n{"subject": "...", "body": "...", "reasoning": "..."}`,
    },
  ];
}

async function tryGenerate(
  system: ContentBlock[],
  user: ContentBlock[],
  model: string
): Promise<ReturnType<typeof validateLetterOutput>> {
  let lastTransientError: Error | null = null;

  for (let attempt = 0; attempt < MAX_TRANSIENT_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(TRANSIENT_BACKOFF_MS[attempt - 1]);
    }
    try {
      const raw = await generateJson({ system, user, model, maxTokens: 1500 });
      return validateLetterOutput(raw);
    } catch (err) {
      if (err instanceof TransientLLMError) {
        lastTransientError = err;
        continue;
      }
      throw err;
    }
  }

  throw lastTransientError!;
}

async function generateWithCorectiveRetry(
  system: ContentBlock[],
  user: ContentBlock[],
  model: string
): Promise<ReturnType<typeof validateLetterOutput>> {
  try {
    return await tryGenerate(system, user, model);
  } catch (err) {
    // Spec §6.5: on validation/malformed failure, one corrective retry
    if (err instanceof ValidationError || err instanceof MalformedJsonError) {
      const correctiveUser = buildCorrectiveUserBlocks(user, err.message);
      return await tryGenerate(system, correctiveUser, model);
    }
    throw err;
  }
}

async function markGenerationFailed(
  sentEmailId: string,
  workspaceId: string,
  actorUserId: string,
  errorMessage: string
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.sentEmail.update({
        where: { id: sentEmailId },
        data: { status: "generation_failed", errorMessage },
      });
      await writeAudit(tx, {
        workspaceId,
        actorUserId,
        action: "letter.generated",
        entityType: "sent_email",
        entityId: sentEmailId,
        payload: { success: false, error: errorMessage },
      });
    });
  } catch (persistErr) {
    console.error(`[generate-letter] Failed to persist failure state for ${sentEmailId}:`, persistErr);
  }
}

export async function processGenerateLetterJob(sentEmailId: string): Promise<void> {
  // Step 1: Idempotency check — only process queued jobs
  const sentEmail = await prisma.sentEmail.findUnique({
    where: { id: sentEmailId },
    select: {
      id: true,
      status: true,
      workspaceId: true,
      contactId: true,
      briefId: true,
      senderUserId: true,
    },
  });

  if (!sentEmail) {
    console.warn(`[generate-letter] sentEmail ${sentEmailId} not found, skipping`);
    return;
  }

  if (sentEmail.status !== "queued") {
    console.log(
      `[generate-letter] sentEmail ${sentEmailId} status=${sentEmail.status}, idempotent no-op`
    );
    return;
  }

  // Step 2: Transition to generating
  await prisma.sentEmail.update({
    where: { id: sentEmailId },
    data: { status: "generating" },
  });

  const { workspaceId, contactId, briefId, senderUserId } = sentEmail;

  try {
    // Step 3: Load all context in parallel
    const [contact, brief, sender, workspace, settings] = await Promise.all([
      prisma.contact.findUniqueOrThrow({ where: { id: contactId } }),
      prisma.brief.findUniqueOrThrow({ where: { id: briefId } }),
      prisma.user.findUniqueOrThrow({
        where: { id: senderUserId },
        select: {
          id: true,
          displayName: true,
          email: true,
          approvedLettersCount: true,
          forcePreviewMode: true,
        },
      }),
      prisma.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: { id: true, name: true },
      }),
      prisma.workspaceSettings.findUnique({ where: { workspaceId } }),
    ]);

    const letterModel = settings?.letterModel ?? "claude-sonnet-4-6";
    const summarizeModel = settings?.summarizeModel ?? "claude-haiku-4-5";
    const calibrationThreshold = settings?.calibrationThreshold ?? 100;

    // Step 4: Fetch web context (inline, non-blocking on failure per spec §7.2)
    const webContextSummary = await ensureFreshWebContext(contactId, workspaceId, summarizeModel);

    // Step 5: Build prompts
    const systemBlocks = buildSystemPrompt();
    const userBlocks = buildUserPrompt({
      brief: {
        name: brief.name,
        productDescription: brief.productDescription,
        audienceOverlap: brief.audienceOverlap,
        whyWorkWithUs: brief.whyWorkWithUs,
        keyProductBenefits: brief.keyProductBenefits,
        desiredFormat: brief.desiredFormat,
        senderRole: brief.senderRole,
        toneOfVoice: brief.toneOfVoice,
        letterLanguage: brief.letterLanguage,
        forbiddenPhrases: brief.forbiddenPhrases,
        noPriceFirstEmail: brief.noPriceFirstEmail,
        landingUrl: brief.landingUrl ?? null,
        promoCode: brief.promoCode ?? null,
        acceptsBarter: brief.acceptsBarter,
        barterOffer: brief.barterOffer ?? null,
        acceptsPaid: brief.acceptsPaid,
        paidBudgetRange: brief.paidBudgetRange ?? null,
      },
      contact: {
        displayName: contact.displayName,
        instagramHandle: contact.instagramHandle ?? null,
        niche: contact.niche ?? null,
        followersCount: contact.followersCount ?? null,
        language: contact.language ?? null,
        notes: contact.notes ?? null,
        country: contact.country ?? null,
      },
      sender: {
        displayName: sender.displayName,
        email: sender.email,
      },
      workspace: { name: workspace.name },
      webContextSummary,
    });

    // Step 6: Generate with retry + corrective-retry (spec §6.4 + §6.5)
    let output: ReturnType<typeof validateLetterOutput>;
    try {
      output = await generateWithCorectiveRetry(systemBlocks, userBlocks, letterModel);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "LLM generation failed";
      await markGenerationFailed(sentEmailId, workspaceId, senderUserId, msg);
      return;
    }

    // Step 7: Routing per spec §7.1 + §7.6
    const needsReview =
      sender.forcePreviewMode || sender.approvedLettersCount < calibrationThreshold;
    const targetStatus = needsReview ? "awaiting_review" : "approved";

    // Step 8: Persist results + audit atomically
    await prisma.$transaction(async (tx) => {
      await tx.sentEmail.update({
        where: { id: sentEmailId },
        data: {
          status: targetStatus,
          subject: output.subject,
          bodyText: output.body,
          modelUsed: letterModel,
          generatedAt: new Date(),
        },
      });
      await writeAudit(tx, {
        workspaceId,
        actorUserId: senderUserId,
        action: "letter.generated",
        entityType: "sent_email",
        entityId: sentEmailId,
        payload: {
          success: true,
          model: letterModel,
          targetStatus,
          reasoning: output.reasoning,
        },
      });
    });

    // Step 9: Enqueue send-email if bypassing review
    if (!needsReview) {
      await getSendEmailQueue().add("send-email", { sentEmailId });
      console.log(`[generate-letter] ${sentEmailId} → approved, send-email enqueued`);
    } else {
      console.log(`[generate-letter] ${sentEmailId} → awaiting_review`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    console.error(`[generate-letter] Unexpected error for ${sentEmailId}:`, err);
    await markGenerationFailed(sentEmailId, workspaceId, senderUserId, msg);
  }
}
