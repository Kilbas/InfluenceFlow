import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

// --- Module mocks ---

vi.mock("../../src/lib/db", () => ({
  prisma: {
    sentEmail: { findUnique: vi.fn(), update: vi.fn() },
    contact: { findUniqueOrThrow: vi.fn() },
    brief: { findUniqueOrThrow: vi.fn() },
    user: { findUniqueOrThrow: vi.fn() },
    workspace: { findUniqueOrThrow: vi.fn() },
    workspaceSettings: { findUnique: vi.fn() },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(mockTx)),
  },
}));

const mockTx = {
  sentEmail: { update: vi.fn() },
  auditEvent: { create: vi.fn() },
};

vi.mock("../../src/lib/web-context", () => ({
  ensureFreshWebContext: vi.fn(),
}));

vi.mock("@/lib/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm")>();
  return {
    ...actual,
    generateJson: vi.fn(),
  };
});

vi.mock("@/lib/queue", () => ({
  getGenerateLetterQueue: vi.fn(),
  getSendEmailQueue: vi.fn(() => ({ add: vi.fn() })),
}));

// --- Imports after mocks ---

import { processGenerateLetterJob } from "../../src/lib/generate-letter";
import { prisma } from "../../src/lib/db";
import { ensureFreshWebContext } from "../../src/lib/web-context";
import { generateJson, ValidationError, TransientLLMError } from "@/lib/llm";
import { getSendEmailQueue } from "@/lib/queue";

const mockPrisma = prisma as unknown as {
  sentEmail: { findUnique: Mock; update: Mock };
  contact: { findUniqueOrThrow: Mock };
  brief: { findUniqueOrThrow: Mock };
  user: { findUniqueOrThrow: Mock };
  workspace: { findUniqueOrThrow: Mock };
  workspaceSettings: { findUnique: Mock };
  $transaction: Mock;
};

const mockEnsureWebContext = ensureFreshWebContext as Mock;
const mockGenerateJson = generateJson as Mock;
const mockGetSendEmailQueue = getSendEmailQueue as Mock;

const SENT_EMAIL_ID = "sent-email-uuid-1";

const sentEmailRow = {
  id: SENT_EMAIL_ID,
  status: "queued" as const,
  workspaceId: "ws-1",
  contactId: "contact-1",
  briefId: "brief-1",
  senderUserId: "user-1",
};

const contactRow = {
  displayName: "Surf Jane",
  instagramHandle: "surfjane",
  niche: "Outdoor",
  followersCount: 50000,
  language: "en",
  notes: null,
  country: "AU",
};

const briefRow = {
  name: "Summer Campaign",
  productDescription: "Sunscreen",
  audienceOverlap: "Outdoor lovers",
  whyWorkWithUs: "Sustainable",
  keyProductBenefits: "SPF 50",
  desiredFormat: "Reel",
  senderRole: "Manager",
  toneOfVoice: "friendly",
  letterLanguage: "auto",
  forbiddenPhrases: [],
  noPriceFirstEmail: true,
  landingUrl: null,
  promoCode: null,
  acceptsBarter: true,
  barterOffer: "Free product",
  acceptsPaid: false,
  paidBudgetRange: null,
};

const senderRow = {
  id: "user-1",
  displayName: "Alice",
  email: "alice@brand.com",
  approvedLettersCount: 0,
  forcePreviewMode: false,
};

const workspaceRow = { id: "ws-1", name: "Brand Co." };

const settingsRow = {
  letterModel: "claude-sonnet-4-6",
  summarizeModel: "claude-haiku-4-5",
  calibrationThreshold: 100,
};

const validLLMOutput = {
  subject: "Quick question about collaboration",
  body: "Hi Jane,\n\nLove your surf content.\n\nBest,\nAlice",
  reasoning: "Used outdoor niche for personalization",
};

function setupHappyPath() {
  mockPrisma.sentEmail.findUnique.mockResolvedValue(sentEmailRow);
  mockPrisma.sentEmail.update.mockResolvedValue({});
  mockPrisma.contact.findUniqueOrThrow.mockResolvedValue(contactRow);
  mockPrisma.brief.findUniqueOrThrow.mockResolvedValue(briefRow);
  mockPrisma.user.findUniqueOrThrow.mockResolvedValue(senderRow);
  mockPrisma.workspace.findUniqueOrThrow.mockResolvedValue(workspaceRow);
  mockPrisma.workspaceSettings.findUnique.mockResolvedValue(settingsRow);
  mockEnsureWebContext.mockResolvedValue("Great surf content creator with 50k followers.");
  mockGenerateJson.mockResolvedValue(validLLMOutput);
  mockTx.sentEmail.update.mockResolvedValue({});
  mockTx.auditEvent.create.mockResolvedValue({});
  mockPrisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(mockTx));
  mockGetSendEmailQueue.mockReturnValue({ add: vi.fn() });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset mockTx mocks too
  mockTx.sentEmail.update.mockReset().mockResolvedValue({});
  mockTx.auditEvent.create.mockReset().mockResolvedValue({});
});

describe("processGenerateLetterJob", () => {
  describe("idempotency", () => {
    it("no-ops when sentEmail not found", async () => {
      mockPrisma.sentEmail.findUnique.mockResolvedValue(null);

      await processGenerateLetterJob(SENT_EMAIL_ID);

      expect(mockPrisma.sentEmail.update).not.toHaveBeenCalled();
    });

    it("no-ops when status is 'generating'", async () => {
      mockPrisma.sentEmail.findUnique.mockResolvedValue({
        ...sentEmailRow, status: "generating",
      });

      await processGenerateLetterJob(SENT_EMAIL_ID);

      expect(mockPrisma.sentEmail.update).not.toHaveBeenCalled();
    });

    it("no-ops when status is 'awaiting_review'", async () => {
      mockPrisma.sentEmail.findUnique.mockResolvedValue({
        ...sentEmailRow, status: "awaiting_review",
      });

      await processGenerateLetterJob(SENT_EMAIL_ID);

      expect(mockPrisma.sentEmail.update).not.toHaveBeenCalled();
    });

    it("no-ops when status is 'sent'", async () => {
      mockPrisma.sentEmail.findUnique.mockResolvedValue({
        ...sentEmailRow, status: "sent",
      });

      await processGenerateLetterJob(SENT_EMAIL_ID);

      expect(mockPrisma.sentEmail.update).not.toHaveBeenCalled();
    });
  });

  describe("calibration routing", () => {
    it("routes to awaiting_review when sender is in calibration (approvedCount < threshold)", async () => {
      setupHappyPath();
      // senderRow has approvedLettersCount=0, threshold=100 → needs review

      await processGenerateLetterJob(SENT_EMAIL_ID);

      expect(mockTx.sentEmail.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "awaiting_review" }),
        })
      );
      // send-email queue should NOT be enqueued
      expect(mockGetSendEmailQueue().add).not.toHaveBeenCalled();
    });

    it("routes to approved and enqueues send-email when approvedCount >= threshold", async () => {
      setupHappyPath();
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
        ...senderRow,
        approvedLettersCount: 100, // equals threshold → bypass review
      });
      const mockAdd = vi.fn();
      mockGetSendEmailQueue.mockReturnValue({ add: mockAdd });

      await processGenerateLetterJob(SENT_EMAIL_ID);

      expect(mockTx.sentEmail.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "approved" }),
        })
      );
      expect(mockAdd).toHaveBeenCalledWith("send-email", { sentEmailId: SENT_EMAIL_ID });
    });

    it("routes to awaiting_review when forcePreviewMode=true even if past threshold", async () => {
      setupHappyPath();
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
        ...senderRow,
        approvedLettersCount: 200,
        forcePreviewMode: true,
      });

      await processGenerateLetterJob(SENT_EMAIL_ID);

      expect(mockTx.sentEmail.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "awaiting_review" }),
        })
      );
    });
  });

  describe("happy path", () => {
    it("transitions to generating, persists output, writes audit", async () => {
      setupHappyPath();

      await processGenerateLetterJob(SENT_EMAIL_ID);

      // Step 2: status set to generating
      expect(mockPrisma.sentEmail.update).toHaveBeenCalledWith({
        where: { id: SENT_EMAIL_ID },
        data: { status: "generating" },
      });

      // Step 8: persisted in transaction
      expect(mockTx.sentEmail.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subject: validLLMOutput.subject,
            bodyText: validLLMOutput.body,
            modelUsed: "claude-sonnet-4-6",
            generatedAt: expect.any(Date),
          }),
        })
      );

      // Audit written
      expect(mockTx.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "letter.generated",
            entityType: "sent_email",
            entityId: SENT_EMAIL_ID,
          }),
        })
      );
    });

    it("calls ensureFreshWebContext before generating", async () => {
      setupHappyPath();

      await processGenerateLetterJob(SENT_EMAIL_ID);

      expect(mockEnsureWebContext).toHaveBeenCalledWith(
        sentEmailRow.contactId,
        sentEmailRow.workspaceId,
        settingsRow.summarizeModel
      );
    });

    it("uses workspace letterModel from settings", async () => {
      setupHappyPath();
      mockPrisma.workspaceSettings.findUnique.mockResolvedValue({
        ...settingsRow,
        letterModel: "claude-opus-4-7",
      });

      await processGenerateLetterJob(SENT_EMAIL_ID);

      expect(mockGenerateJson).toHaveBeenCalledWith(
        expect.objectContaining({ model: "claude-opus-4-7" })
      );
    });

    it("falls back to claude-sonnet-4-6 when settings row is missing", async () => {
      setupHappyPath();
      mockPrisma.workspaceSettings.findUnique.mockResolvedValue(null);

      await processGenerateLetterJob(SENT_EMAIL_ID);

      expect(mockGenerateJson).toHaveBeenCalledWith(
        expect.objectContaining({ model: "claude-sonnet-4-6" })
      );
    });
  });

  describe("transient error retries (spec §6.4)", () => {
    it("retries up to 3 times on TransientLLMError then marks generation_failed", async () => {
      setupHappyPath();
      vi.useFakeTimers();

      const transientErr = new TransientLLMError("Rate limited", 429);
      mockGenerateJson.mockRejectedValue(transientErr);

      const jobPromise = processGenerateLetterJob(SENT_EMAIL_ID);

      // Advance past all backoff intervals (2s + 4s + 8s = 14s)
      await vi.runAllTimersAsync();
      await jobPromise;

      expect(mockGenerateJson).toHaveBeenCalledTimes(3);
      expect(mockTx.sentEmail.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "generation_failed" }),
        })
      );

      vi.useRealTimers();
    });

    it("succeeds on third attempt after two transient errors", async () => {
      setupHappyPath();
      vi.useFakeTimers();

      mockGenerateJson
        .mockRejectedValueOnce(new TransientLLMError("429", 429))
        .mockRejectedValueOnce(new TransientLLMError("503", 503))
        .mockResolvedValueOnce(validLLMOutput);

      const jobPromise = processGenerateLetterJob(SENT_EMAIL_ID);
      await vi.runAllTimersAsync();
      await jobPromise;

      expect(mockGenerateJson).toHaveBeenCalledTimes(3);
      expect(mockTx.sentEmail.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "awaiting_review" }),
        })
      );

      vi.useRealTimers();
    });
  });

  describe("corrective retry (spec §6.5)", () => {
    it("retries once with corrective message on ValidationError then succeeds", async () => {
      setupHappyPath();

      mockGenerateJson
        .mockResolvedValueOnce({ subject: "", body: "", reasoning: "" }) // triggers ValidationError
        .mockResolvedValueOnce(validLLMOutput);

      await processGenerateLetterJob(SENT_EMAIL_ID);

      expect(mockGenerateJson).toHaveBeenCalledTimes(2);
      // Second call user prompt should contain corrective message
      const secondCallUser = mockGenerateJson.mock.calls[1][0].user as Array<{ text: string }>;
      const hasCorectiveBlock = secondCallUser.some((b) => b.text.includes("previous response was invalid"));
      expect(hasCorectiveBlock).toBe(true);

      expect(mockTx.sentEmail.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "awaiting_review" }),
        })
      );
    });

    it("marks generation_failed when both attempts produce invalid output", async () => {
      setupHappyPath();

      mockGenerateJson
        .mockResolvedValueOnce({ subject: "", body: "", reasoning: "" })
        .mockResolvedValueOnce({ subject: "", body: "", reasoning: "" });

      await processGenerateLetterJob(SENT_EMAIL_ID);

      expect(mockGenerateJson).toHaveBeenCalledTimes(2);
      expect(mockTx.sentEmail.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "generation_failed" }),
        })
      );
    });

    it("writes audit even on generation_failed", async () => {
      setupHappyPath();
      mockGenerateJson.mockRejectedValue(new Error("Unexpected LLM error"));

      await processGenerateLetterJob(SENT_EMAIL_ID);

      expect(mockTx.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: "letter.generated" }),
        })
      );
    });
  });
});
