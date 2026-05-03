import { describe, it, expect } from "vitest";
import {
  resolveLanguage,
  buildSystemPrompt,
  buildUserPrompt,
  type PromptBriefInput,
  type PromptContactInput,
  type PromptSenderInput,
  type PromptWorkspaceInput,
} from "../../src/lib/prompts";

const baseBrief: PromptBriefInput = {
  name: "Summer Campaign",
  productDescription: "Organic sunscreen for outdoor enthusiasts",
  audienceOverlap: "Health-conscious millennials who love the outdoors",
  whyWorkWithUs: "We share your values of sustainability",
  keyProductBenefits: "SPF 50, reef-safe, no white cast",
  desiredFormat: "Instagram Reel or Story",
  senderRole: "Brand Partnerships Manager",
  toneOfVoice: "friendly",
  letterLanguage: "auto",
  forbiddenPhrases: [],
  noPriceFirstEmail: true,
  landingUrl: null,
  promoCode: null,
};

const baseContact: PromptContactInput = {
  displayName: "Surf Jane",
  instagramHandle: "surfjane",
  niche: "Outdoor & Surf",
  followersCount: 45000,
  language: null,
  notes: null,
};

const baseSender: PromptSenderInput = {
  displayName: "Alice Tanner",
  email: "alice@brand.com",
};

const baseWorkspace: PromptWorkspaceInput = {
  name: "SunGuard Co.",
};

describe("resolveLanguage", () => {
  it("returns contact language when brief is auto", () => {
    expect(resolveLanguage({ letterLanguage: "auto" }, { language: "es" })).toBe("es");
  });

  it("falls back to en when brief is auto and contact has no language", () => {
    expect(resolveLanguage({ letterLanguage: "auto" }, { language: null })).toBe("en");
  });

  it("uses brief language when explicitly set, ignoring contact language", () => {
    expect(resolveLanguage({ letterLanguage: "fr" }, { language: "es" })).toBe("fr");
  });

  it("uses brief language when set even if contact has no language", () => {
    expect(resolveLanguage({ letterLanguage: "de" }, { language: null })).toBe("de");
  });
});

describe("buildSystemPrompt", () => {
  it("returns an array of exactly one block", () => {
    const blocks = buildSystemPrompt();
    expect(blocks).toHaveLength(1);
  });

  it("has cache_control ephemeral on the system block", () => {
    const [block] = buildSystemPrompt();
    expect(block.cache_control).toEqual({ type: "ephemeral" });
  });

  it("mentions JSON output format", () => {
    const [block] = buildSystemPrompt();
    expect(block.text).toContain("JSON");
  });

  it("references subject and body fields", () => {
    const [block] = buildSystemPrompt();
    expect(block.text).toContain("subject");
    expect(block.text).toContain("body");
  });

  it("specifies subject character limit", () => {
    const [block] = buildSystemPrompt();
    expect(block.text).toContain("80");
  });

  it("specifies body character limit", () => {
    const [block] = buildSystemPrompt();
    expect(block.text).toContain("2000");
  });

  it("forbids HTML in output", () => {
    const [block] = buildSystemPrompt();
    expect(block.text.toLowerCase()).toContain("no html");
  });
});

describe("buildUserPrompt", () => {
  it("returns an array of exactly two blocks", () => {
    const blocks = buildUserPrompt({
      brief: baseBrief,
      contact: baseContact,
      sender: baseSender,
      workspace: baseWorkspace,
      webContextSummary: null,
    });
    expect(blocks).toHaveLength(2);
  });

  it("first block (brief section) has cache_control ephemeral", () => {
    const [briefBlock] = buildUserPrompt({
      brief: baseBrief,
      contact: baseContact,
      sender: baseSender,
      workspace: baseWorkspace,
      webContextSummary: null,
    });
    expect(briefBlock.cache_control).toEqual({ type: "ephemeral" });
  });

  it("second block (creator/sender section) has no cache_control", () => {
    const blocks = buildUserPrompt({
      brief: baseBrief,
      contact: baseContact,
      sender: baseSender,
      workspace: baseWorkspace,
      webContextSummary: null,
    });
    expect(blocks[1].cache_control).toBeUndefined();
  });

  it("includes forbidden phrases in brief section when non-empty", () => {
    const [briefBlock] = buildUserPrompt({
      brief: { ...baseBrief, forbiddenPhrases: ["synergy", "circle back"] },
      contact: baseContact,
      sender: baseSender,
      workspace: baseWorkspace,
      webContextSummary: null,
    });
    expect(briefBlock.text).toContain("synergy");
    expect(briefBlock.text).toContain("circle back");
  });

  it("does not mention forbidden phrases when list is empty", () => {
    const [briefBlock] = buildUserPrompt({
      brief: { ...baseBrief, forbiddenPhrases: [] },
      contact: baseContact,
      sender: baseSender,
      workspace: baseWorkspace,
      webContextSummary: null,
    });
    expect(briefBlock.text).not.toContain("Do NOT use these phrases");
  });

  it("uses fallback text when webContextSummary is null", () => {
    const blocks = buildUserPrompt({
      brief: baseBrief,
      contact: baseContact,
      sender: baseSender,
      workspace: baseWorkspace,
      webContextSummary: null,
    });
    expect(blocks[1].text).toContain("Not available");
  });

  it("includes web context summary when provided", () => {
    const blocks = buildUserPrompt({
      brief: baseBrief,
      contact: baseContact,
      sender: baseSender,
      workspace: baseWorkspace,
      webContextSummary: "Creator posts weekly surf vlogs with strong engagement",
    });
    expect(blocks[1].text).toContain("Creator posts weekly surf vlogs");
  });

  it("resolves language and includes it in brief section", () => {
    const [briefBlock] = buildUserPrompt({
      brief: { ...baseBrief, letterLanguage: "auto" },
      contact: { ...baseContact, language: "pt" },
      sender: baseSender,
      workspace: baseWorkspace,
      webContextSummary: null,
    });
    expect(briefBlock.text).toContain("pt");
  });

  it("includes noPriceFirstEmail instruction when true", () => {
    const [briefBlock] = buildUserPrompt({
      brief: { ...baseBrief, noPriceFirstEmail: true },
      contact: baseContact,
      sender: baseSender,
      workspace: baseWorkspace,
      webContextSummary: null,
    });
    expect(briefBlock.text.toLowerCase()).toContain("pricing");
  });

  it("omits noPriceFirstEmail instruction when false", () => {
    const [briefBlock] = buildUserPrompt({
      brief: { ...baseBrief, noPriceFirstEmail: false },
      contact: baseContact,
      sender: baseSender,
      workspace: baseWorkspace,
      webContextSummary: null,
    });
    expect(briefBlock.text).not.toContain("Do NOT mention pricing");
  });

  it("includes contact instagram handle when present", () => {
    const blocks = buildUserPrompt({
      brief: baseBrief,
      contact: { ...baseContact, instagramHandle: "surfjane" },
      sender: baseSender,
      workspace: baseWorkspace,
      webContextSummary: null,
    });
    expect(blocks[1].text).toContain("@surfjane");
  });

  it("includes landing URL in brief section when provided", () => {
    const [briefBlock] = buildUserPrompt({
      brief: { ...baseBrief, landingUrl: "https://brand.com/collab" },
      contact: baseContact,
      sender: baseSender,
      workspace: baseWorkspace,
      webContextSummary: null,
    });
    expect(briefBlock.text).toContain("https://brand.com/collab");
  });

  it("includes workspace name in brief section", () => {
    const [briefBlock] = buildUserPrompt({
      brief: baseBrief,
      contact: baseContact,
      sender: baseSender,
      workspace: { name: "SunGuard Co." },
      webContextSummary: null,
    });
    expect(briefBlock.text).toContain("SunGuard Co.");
  });
});
