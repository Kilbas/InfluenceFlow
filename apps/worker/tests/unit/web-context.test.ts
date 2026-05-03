import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

// vi.hoisted runs before vi.mock factories — this is how we share mock refs
const mockAnthropicCreate = vi.hoisted(() => vi.fn());

// --- Module mocks ---

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockAnthropicCreate };
  },
}));

vi.mock("../../src/lib/db", () => ({
  prisma: {
    webContext: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    contact: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/search")>();
  return { ...actual, searchCreator: vi.fn() };
});

// --- Imports after mocks ---

import { ensureFreshWebContext, deleteStaleWebContexts } from "../../src/lib/web-context";
import { prisma } from "../../src/lib/db";
import { searchCreator, BraveUnavailableError } from "@/lib/search";

const mockPrisma = prisma as unknown as {
  webContext: { findUnique: Mock; upsert: Mock; deleteMany: Mock };
  contact: { findUnique: Mock };
};
const mockSearch = searchCreator as Mock;

const CONTACT_ID = "contact-uuid-1";
const WORKSPACE_ID = "workspace-uuid-1";
const MODEL = "claude-haiku-4-5";

const contactRow = {
  displayName: "Surf Jane",
  instagramHandle: "surfjane",
  niche: "Outdoor & Surf",
};

const searchResults = [
  { title: "Surf Jane | Instagram", url: "https://instagram.com/surfjane", description: "Outdoor content" },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.contact.findUnique.mockResolvedValue(contactRow);
  mockPrisma.webContext.upsert.mockResolvedValue({});
  mockPrisma.webContext.deleteMany.mockResolvedValue({ count: 0 });
});

describe("ensureFreshWebContext", () => {
  it("returns cached summary when row is fresh", async () => {
    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    mockPrisma.webContext.findUnique.mockResolvedValue({
      summary: "Cached summary",
      expiresAt: futureDate,
    });

    const result = await ensureFreshWebContext(CONTACT_ID, WORKSPACE_ID, MODEL);

    expect(result).toBe("Cached summary");
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("returns null when cached row is fresh but summary was null", async () => {
    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    mockPrisma.webContext.findUnique.mockResolvedValue({ summary: null, expiresAt: futureDate });

    const result = await ensureFreshWebContext(CONTACT_ID, WORKSPACE_ID, MODEL);

    expect(result).toBeNull();
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("refetches when row is expired", async () => {
    const pastDate = new Date(Date.now() - 1000);
    mockPrisma.webContext.findUnique.mockResolvedValue({ summary: "Old", expiresAt: pastDate });
    mockSearch.mockResolvedValue([]);

    await ensureFreshWebContext(CONTACT_ID, WORKSPACE_ID, MODEL);

    expect(mockSearch).toHaveBeenCalledOnce();
  });

  it("fetches when no row exists", async () => {
    mockPrisma.webContext.findUnique.mockResolvedValue(null);
    mockSearch.mockResolvedValue([]);

    await ensureFreshWebContext(CONTACT_ID, WORKSPACE_ID, MODEL);

    expect(mockSearch).toHaveBeenCalledOnce();
  });

  it("upserts null and returns null on BraveUnavailableError", async () => {
    mockPrisma.webContext.findUnique.mockResolvedValue(null);
    mockSearch.mockRejectedValue(new BraveUnavailableError("API key missing"));

    const result = await ensureFreshWebContext(CONTACT_ID, WORKSPACE_ID, MODEL);

    expect(result).toBeNull();
    expect(mockPrisma.webContext.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ summary: null, rawSearchResults: [] }),
        update: expect.objectContaining({ summary: null, rawSearchResults: [] }),
      })
    );
  });

  it("upserts null and returns null on zero search results", async () => {
    mockPrisma.webContext.findUnique.mockResolvedValue(null);
    mockSearch.mockResolvedValue([]);

    const result = await ensureFreshWebContext(CONTACT_ID, WORKSPACE_ID, MODEL);

    expect(result).toBeNull();
    expect(mockPrisma.webContext.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ summary: null }),
      })
    );
  });

  it("stores and returns summary when Haiku returns a profile", async () => {
    mockPrisma.webContext.findUnique.mockResolvedValue(null);
    mockSearch.mockResolvedValue(searchResults);
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: "Paragraph 1.\n\nParagraph 2.\n\nParagraph 3." }],
    });

    const result = await ensureFreshWebContext(CONTACT_ID, WORKSPACE_ID, MODEL);

    expect(result).toBe("Paragraph 1.\n\nParagraph 2.\n\nParagraph 3.");
    expect(mockPrisma.webContext.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ summary: "Paragraph 1.\n\nParagraph 2.\n\nParagraph 3." }),
      })
    );
  });

  it("stores null when Haiku responds with 'insufficient context'", async () => {
    mockPrisma.webContext.findUnique.mockResolvedValue(null);
    mockSearch.mockResolvedValue(searchResults);
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: "insufficient context" }],
    });

    const result = await ensureFreshWebContext(CONTACT_ID, WORKSPACE_ID, MODEL);

    expect(result).toBeNull();
    expect(mockPrisma.webContext.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ summary: null }),
      })
    );
  });

  it("stores null when Haiku call throws (generation must not be blocked)", async () => {
    mockPrisma.webContext.findUnique.mockResolvedValue(null);
    mockSearch.mockResolvedValue(searchResults);
    mockAnthropicCreate.mockRejectedValue(new Error("Haiku timeout"));

    const result = await ensureFreshWebContext(CONTACT_ID, WORKSPACE_ID, MODEL);

    expect(result).toBeNull();
    expect(mockPrisma.webContext.upsert).toHaveBeenCalled();
  });

  it("persists rawSearchResults even when summary is null (insufficient context)", async () => {
    mockPrisma.webContext.findUnique.mockResolvedValue(null);
    mockSearch.mockResolvedValue(searchResults);
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: "insufficient context" }],
    });

    await ensureFreshWebContext(CONTACT_ID, WORKSPACE_ID, MODEL);

    expect(mockPrisma.webContext.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ rawSearchResults: searchResults }),
      })
    );
  });
});

describe("deleteStaleWebContexts", () => {
  it("calls deleteMany with correct cutoff (~90 days ago) and returns count", async () => {
    mockPrisma.webContext.deleteMany.mockResolvedValue({ count: 7 });

    const count = await deleteStaleWebContexts();

    expect(count).toBe(7);
    expect(mockPrisma.webContext.deleteMany).toHaveBeenCalledWith({
      where: { fetchedAt: { lt: expect.any(Date) } },
    });

    const { where } = mockPrisma.webContext.deleteMany.mock.calls[0][0] as {
      where: { fetchedAt: { lt: Date } };
    };
    const cutoff = where.fetchedAt.lt;
    const ageMs = Date.now() - cutoff.getTime();
    expect(ageMs).toBeGreaterThan(89 * 24 * 60 * 60 * 1000);
    expect(ageMs).toBeLessThan(91 * 24 * 60 * 60 * 1000);
  });
});
