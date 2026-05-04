import { describe, it, expect } from "vitest";
import { buildUserPrompt, type PromptBriefInput, type PromptContactInput } from "../../src/lib/prompts";

const baseSender = { displayName: "Alice", email: "alice@brand.com" };
const baseWorkspace = { name: "Brand Co." };
const baseContact: PromptContactInput = {
  displayName: "Creator",
  instagramHandle: "creator",
  niche: "Lifestyle",
  followersCount: 10000,
  language: null,
  notes: null,
  country: null,
};
const baseBrief: PromptBriefInput = {
  name: "Campaign",
  productDescription: "A product",
  audienceOverlap: "Overlap",
  whyWorkWithUs: "Why",
  keyProductBenefits: "Benefits",
  desiredFormat: "Reel",
  senderRole: "Manager",
  toneOfVoice: "friendly",
  letterLanguage: "en",
  forbiddenPhrases: [],
  noPriceFirstEmail: false,
  landingUrl: null,
  promoCode: null,
};

describe("buildUserPrompt — extended spec §6.2 fields", () => {
  describe("barter/paid offer section", () => {
    it("shows barter offer when acceptsBarter=true and barterOffer provided", () => {
      const [block] = buildUserPrompt({
        brief: { ...baseBrief, acceptsBarter: true, barterOffer: "Free product + commission" },
        contact: baseContact,
        sender: baseSender,
        workspace: baseWorkspace,
        webContextSummary: null,
      });
      expect(block.text).toContain("Barter: Free product + commission");
    });

    it("shows 'offered' when acceptsBarter=true but barterOffer is null", () => {
      const [block] = buildUserPrompt({
        brief: { ...baseBrief, acceptsBarter: true, barterOffer: null },
        contact: baseContact,
        sender: baseSender,
        workspace: baseWorkspace,
        webContextSummary: null,
      });
      expect(block.text).toContain("Barter: offered");
    });

    it("shows 'not offered' when acceptsBarter=false", () => {
      const [block] = buildUserPrompt({
        brief: { ...baseBrief, acceptsBarter: false, barterOffer: "Some offer" },
        contact: baseContact,
        sender: baseSender,
        workspace: baseWorkspace,
        webContextSummary: null,
      });
      expect(block.text).toContain("Barter: not offered");
    });

    it("shows paid budget when acceptsPaid=true and paidBudgetRange provided", () => {
      const [block] = buildUserPrompt({
        brief: { ...baseBrief, acceptsBarter: false, acceptsPaid: true, paidBudgetRange: "$500–$1000" },
        contact: baseContact,
        sender: baseSender,
        workspace: baseWorkspace,
        webContextSummary: null,
      });
      expect(block.text).toContain("Paid: $500–$1000");
    });

    it("shows 'not offered' for paid when acceptsPaid=false", () => {
      const [block] = buildUserPrompt({
        brief: { ...baseBrief, acceptsBarter: false, acceptsPaid: false },
        contact: baseContact,
        sender: baseSender,
        workspace: baseWorkspace,
        webContextSummary: null,
      });
      expect(block.text).toContain("Paid: not offered");
    });

    it("omits the entire offer section when neither field is provided (M4 backward compat)", () => {
      const [block] = buildUserPrompt({
        brief: baseBrief, // no acceptsBarter/acceptsPaid
        contact: baseContact,
        sender: baseSender,
        workspace: baseWorkspace,
        webContextSummary: null,
      });
      expect(block.text).not.toContain("What we offer");
      expect(block.text).not.toContain("Barter:");
      expect(block.text).not.toContain("Paid:");
    });
  });

  describe("contact.country", () => {
    it("includes country in creator section when provided", () => {
      const blocks = buildUserPrompt({
        brief: baseBrief,
        contact: { ...baseContact, country: "Australia" },
        sender: baseSender,
        workspace: baseWorkspace,
        webContextSummary: null,
      });
      expect(blocks[1].text).toContain("Country: Australia");
    });

    it("omits country when null", () => {
      const blocks = buildUserPrompt({
        brief: baseBrief,
        contact: { ...baseContact, country: null },
        sender: baseSender,
        workspace: baseWorkspace,
        webContextSummary: null,
      });
      expect(blocks[1].text).not.toContain("Country:");
    });

    it("omits country when undefined (M4 backward compat)", () => {
      const blocks = buildUserPrompt({
        brief: baseBrief,
        contact: baseContact, // no country property
        sender: baseSender,
        workspace: baseWorkspace,
        webContextSummary: null,
      });
      expect(blocks[1].text).not.toContain("Country:");
    });
  });
});
