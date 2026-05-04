import type { ContentBlock } from "@/lib/llm";

export type PromptBriefInput = {
  name: string;
  productDescription: string;
  audienceOverlap: string;
  whyWorkWithUs: string;
  keyProductBenefits: string;
  desiredFormat: string;
  senderRole: string;
  toneOfVoice: string;
  letterLanguage: string;
  forbiddenPhrases: string[];
  noPriceFirstEmail: boolean;
  landingUrl: string | null;
  promoCode: string | null;
  // Spec §6.2: barter/paid offer section (optional for backward compat with M4 tests)
  acceptsBarter?: boolean;
  barterOffer?: string | null;
  acceptsPaid?: boolean;
  paidBudgetRange?: string | null;
};

export type PromptContactInput = {
  displayName: string;
  instagramHandle: string | null;
  niche: string | null;
  followersCount: number | null;
  language: string | null;
  notes: string | null;
  country?: string | null;
};

export type PromptSenderInput = {
  displayName: string;
  email: string;
};

export type PromptWorkspaceInput = {
  name: string;
};

export function resolveLanguage(
  brief: Pick<PromptBriefInput, "letterLanguage">,
  contact: Pick<PromptContactInput, "language">
): string {
  if (brief.letterLanguage && brief.letterLanguage !== "auto") {
    return brief.letterLanguage;
  }
  return contact.language ?? "en";
}

export function buildSystemPrompt(): ContentBlock[] {
  return [
    {
      type: "text",
      text: `You are an expert influencer outreach specialist. Your task is to write a personalized, compelling outreach email to a content creator on behalf of a brand.

Your output MUST be a JSON object with exactly these fields:
{
  "subject": "Email subject line",
  "body": "Email body text (plain text only, no HTML)",
  "reasoning": "Brief explanation of your creative choices"
}

Rules:
- "subject" must be 80 characters or fewer. No HTML.
- "body" must be 2000 characters or fewer. No HTML tags. Plain text only. Use line breaks for paragraphs.
- "reasoning" is for internal notes; it is not sent to the creator.
- Write in the language specified in the request. Default to English if not specified.
- Be genuine, concise, and creator-focused. Lead with value to the creator, not what you need from them.
- Do NOT use generic phrases like "I hope this finds you well" or "reach out".
- Match the tone of voice specified in the brief exactly.
- Do NOT include pricing, rates, or budget in the first email unless explicitly told otherwise.
- Personalize using the creator's niche, content style, and any available web context.
- Output ONLY the JSON object. No markdown fences, no extra text.`,
      cache_control: { type: "ephemeral" },
    },
  ];
}

function formatBriefSection(
  brief: PromptBriefInput,
  workspace: PromptWorkspaceInput,
  language: string
): string {
  const lines: string[] = [
    `## Brand Brief`,
    `Company: ${workspace.name}`,
    `Campaign: ${brief.name}`,
    `Product description: ${brief.productDescription}`,
    `Audience overlap: ${brief.audienceOverlap}`,
    `Why work with us: ${brief.whyWorkWithUs}`,
    `Key product benefits: ${brief.keyProductBenefits}`,
    `Desired content format: ${brief.desiredFormat}`,
    `Sender role: ${brief.senderRole}`,
    `Tone of voice: ${brief.toneOfVoice}`,
    `Language: ${language}`,
  ];

  if (brief.acceptsBarter !== undefined || brief.acceptsPaid !== undefined) {
    lines.push(`What we offer the creator:`);
    lines.push(`- Barter: ${brief.acceptsBarter ? (brief.barterOffer ?? "offered") : "not offered"}`);
    lines.push(`- Paid: ${brief.acceptsPaid ? (brief.paidBudgetRange ?? "offered") : "not offered"}`);
  }

  if (brief.noPriceFirstEmail) {
    lines.push(`Do NOT mention pricing or budget in this email.`);
  }

  if (brief.forbiddenPhrases.length > 0) {
    lines.push(`Do NOT use these phrases: ${brief.forbiddenPhrases.join(", ")}`);
  }

  if (brief.landingUrl) {
    lines.push(`Landing URL (include if relevant): ${brief.landingUrl}`);
  }

  if (brief.promoCode) {
    lines.push(`Promo code (include if relevant): ${brief.promoCode}`);
  }

  return lines.join("\n");
}

function formatCreatorSection(
  contact: PromptContactInput,
  sender: PromptSenderInput,
  webContextSummary: string | null
): string {
  const lines: string[] = [`## Creator`];

  lines.push(`Name: ${contact.displayName}`);

  if (contact.instagramHandle) {
    lines.push(`Instagram: @${contact.instagramHandle}`);
  }

  if (contact.niche) {
    lines.push(`Niche: ${contact.niche}`);
  }

  if (contact.country) {
    lines.push(`Country: ${contact.country}`);
  }

  if (contact.followersCount != null) {
    lines.push(`Followers: ${contact.followersCount.toLocaleString()}`);
  }

  if (contact.notes) {
    lines.push(`Notes: ${contact.notes}`);
  }

  lines.push(
    `Web context: ${webContextSummary ?? "Not available"}`
  );

  lines.push(
    ``,
    `## Sender`,
    `Name: ${sender.displayName}`,
    `Email: ${sender.email}`
  );

  return lines.join("\n");
}

function buildClosingInstruction(): string {
  return "Now write the email. Output JSON only.";
}

export function buildUserPrompt(opts: {
  brief: PromptBriefInput;
  contact: PromptContactInput;
  sender: PromptSenderInput;
  workspace: PromptWorkspaceInput;
  webContextSummary: string | null;
}): ContentBlock[] {
  const { brief, contact, sender, workspace, webContextSummary } = opts;
  const language = resolveLanguage(brief, contact);

  return [
    {
      type: "text",
      text: formatBriefSection(brief, workspace, language),
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: formatCreatorSection(contact, sender, webContextSummary) + "\n\n" + buildClosingInstruction(),
    },
  ];
}
