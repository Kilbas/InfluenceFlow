import Anthropic from "@anthropic-ai/sdk";

export class TransientLLMError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "TransientLLMError";
  }
}

export class MalformedJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedJsonError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export type ContentBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
};

// `system` and `user` accept either a plain string or an array of content blocks.
// Pass an array with `cache_control: { type: "ephemeral" }` on a block to enable
// Anthropic prompt caching for that block (§6.3 of phase-2 design).
export interface GenerateJsonOptions {
  system: string | ContentBlock[];
  user: string | ContentBlock[];
  model: string;
  maxTokens?: number;
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

function toTextBlocks(blocks: ContentBlock[]): Anthropic.TextBlockParam[] {
  return blocks.map((b) => {
    const out: Anthropic.TextBlockParam = { type: "text", text: b.text };
    if (b.cache_control) out.cache_control = b.cache_control;
    return out;
  });
}

function normalizeSystem(
  system: string | ContentBlock[]
): Anthropic.TextBlockParam[] {
  if (typeof system === "string") return [{ type: "text", text: system }];
  return toTextBlocks(system);
}

function normalizeUser(
  user: string | ContentBlock[]
): string | Anthropic.TextBlockParam[] {
  if (typeof user === "string") return user;
  return toTextBlocks(user);
}

function stripCodeFence(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : text.trim();
}

export async function generateJson<T = unknown>(
  options: GenerateJsonOptions
): Promise<T> {
  const client = getClient();
  const system = normalizeSystem(options.system);
  const userContent = normalizeUser(options.user);

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: options.model,
      max_tokens: options.maxTokens ?? 1024,
      system,
      messages: [{ role: "user", content: userContent }],
    });
  } catch (error) {
    // Per §6.4 only 429 and 5xx are transient. Other APIErrors (4xx) are
    // re-thrown unchanged so callers can decide what to do with them.
    if (error instanceof Anthropic.APIError) {
      if (error.status === 429 || (error.status >= 500 && error.status < 600)) {
        throw new TransientLLMError(error.message, error.status);
      }
    }
    throw error;
  }

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new MalformedJsonError("No text block in LLM response");
  }

  const raw = stripCodeFence(block.text);
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new MalformedJsonError(
      `JSON parse failed. Raw output (first 300 chars): ${raw.slice(0, 300)}`
    );
  }
}

const HTML_TAG_RE = /<[^>]+>/;

export interface LetterOutput {
  subject: string;
  body: string;
  reasoning: string;
}

export function validateLetterOutput(output: unknown): LetterOutput {
  if (typeof output !== "object" || output === null) {
    throw new ValidationError("LLM output must be a JSON object");
  }

  const o = output as Record<string, unknown>;

  if (typeof o.subject !== "string" || o.subject.trim() === "") {
    throw new ValidationError("subject must be a non-empty string");
  }
  if (o.subject.length > 80) {
    throw new ValidationError(
      `subject exceeds 80 chars (${o.subject.length})`
    );
  }
  if (HTML_TAG_RE.test(o.subject)) {
    throw new ValidationError("subject must not contain HTML");
  }

  if (typeof o.body !== "string" || o.body.trim() === "") {
    throw new ValidationError("body must be a non-empty string");
  }
  if (o.body.length > 2000) {
    throw new ValidationError(`body exceeds 2000 chars (${o.body.length})`);
  }
  if (HTML_TAG_RE.test(o.body)) {
    throw new ValidationError("body must not contain HTML tags");
  }

  const reasoning =
    typeof o.reasoning === "string" ? o.reasoning : "";

  return { subject: o.subject.trim(), body: o.body, reasoning };
}
