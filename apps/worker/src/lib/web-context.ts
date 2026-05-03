import Anthropic from "@anthropic-ai/sdk";
import type { Prisma } from "@prisma/client";
import { searchCreator, BraveUnavailableError, type BraveSearchResult } from "@/lib/search";
import { prisma } from "./db";

const CACHE_TTL_DAYS = 30;
const CLEANUP_AGE_DAYS = 90;
const INSUFFICIENT_CONTEXT_SENTINEL = "insufficient context";

function buildSummarizerPrompt(displayName: string, results: BraveSearchResult[]): string {
  const formatted = results
    .map((r, i) => `${i + 1}. ${r.title}\n${r.url}${r.description ? `\n${r.description}` : ""}`)
    .join("\n\n");

  return (
    `Given these search results about content creator "${displayName}", write a concise 3-paragraph profile covering:\n` +
    `1. Content style and focus areas\n` +
    `2. Audience profile and engagement signals\n` +
    `3. Commercial activity and brand partnership history\n\n` +
    `Be specific and factual. Use only information present in the results. Do not invent or speculate.\n` +
    `If the results don't contain enough meaningful information about this creator, respond with exactly: "${INSUFFICIENT_CONTEXT_SENTINEL}"\n\n` +
    `Search results:\n${formatted}`
  );
}

async function summarizeWithModel(
  displayName: string,
  results: BraveSearchResult[],
  model: string
): Promise<string | null> {
  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model,
      max_tokens: 512,
      messages: [{ role: "user", content: buildSummarizerPrompt(displayName, results) }],
    });

    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return null;

    const text = block.text.trim();
    return text === INSUFFICIENT_CONTEXT_SENTINEL ? null : text;
  } catch (err) {
    console.warn(`[web-context] Summarizer call failed (${model}):`, err);
    return null;
  }
}

export async function ensureFreshWebContext(
  contactId: string,
  workspaceId: string,
  summarizeModel: string
): Promise<string | null> {
  const existing = await prisma.webContext.findUnique({
    where: { contactId },
    select: { summary: true, expiresAt: true },
  });

  if (existing && existing.expiresAt > new Date()) {
    return existing.summary;
  }

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { displayName: true, instagramHandle: true, niche: true },
  });

  if (!contact) return null;

  const expiresAt = new Date(Date.now() + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);

  let results: BraveSearchResult[];
  try {
    results = await searchCreator({
      displayName: contact.displayName,
      instagramHandle: contact.instagramHandle ?? "",
      niche: contact.niche ?? "",
    });
  } catch (err) {
    if (err instanceof BraveUnavailableError) {
      console.warn(`[web-context] Brave unavailable for ${contactId}: ${err.message}`);
    } else {
      console.warn(`[web-context] Search error for ${contactId}:`, err);
    }
    await upsertWebContext(contactId, workspaceId, null, [], expiresAt);
    return null;
  }

  if (results.length === 0) {
    await upsertWebContext(contactId, workspaceId, null, [], expiresAt);
    return null;
  }

  const summary = await summarizeWithModel(contact.displayName, results, summarizeModel);
  await upsertWebContext(contactId, workspaceId, summary, results, expiresAt);
  return summary;
}

async function upsertWebContext(
  contactId: string,
  workspaceId: string,
  summary: string | null,
  rawSearchResults: BraveSearchResult[],
  expiresAt: Date
): Promise<void> {
  const raw = rawSearchResults as unknown as Prisma.InputJsonValue;
  await prisma.webContext.upsert({
    where: { contactId },
    create: { contactId, workspaceId, summary, rawSearchResults: raw, expiresAt },
    update: { summary, rawSearchResults: raw, expiresAt },
  });
}

export async function deleteStaleWebContexts(): Promise<number> {
  const cutoff = new Date(Date.now() - CLEANUP_AGE_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.webContext.deleteMany({
    where: { fetchedAt: { lt: cutoff } },
  });
  return result.count;
}
