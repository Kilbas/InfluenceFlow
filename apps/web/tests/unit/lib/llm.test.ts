import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateLetterOutput,
  ValidationError,
  MalformedJsonError,
  TransientLLMError,
} from "@/lib/llm";

// Shared mock create fn so tests can configure responses
const mockCreate = vi.fn();

// Mock the Anthropic SDK so generateJson tests work without a real API key
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = "APIError";
      this.status = status;
    }
  }
  class MockAnthropic {
    messages = { create: mockCreate };
    static APIError = APIError;
  }
  return { default: MockAnthropic };
});

describe("validateLetterOutput", () => {
  it("accepts a valid letter object", () => {
    const result = validateLetterOutput({
      subject: "Quick question about your content",
      body: "Hi Alice,\n\nI saw your recent post and thought it was great.",
      reasoning: "Used recent post as opener",
    });
    expect(result.subject).toBe("Quick question about your content");
    expect(result.body).toContain("Hi Alice");
    expect(result.reasoning).toBe("Used recent post as opener");
  });

  it("trims subject whitespace", () => {
    const result = validateLetterOutput({
      subject: "  Hello world  ",
      body: "Body text here",
      reasoning: "",
    });
    expect(result.subject).toBe("Hello world");
  });

  it("defaults reasoning to empty string when missing", () => {
    const result = validateLetterOutput({
      subject: "Subject line",
      body: "Body text",
    });
    expect(result.reasoning).toBe("");
  });

  it("throws ValidationError when subject is empty", () => {
    expect(() =>
      validateLetterOutput({ subject: "", body: "body", reasoning: "" })
    ).toThrow(ValidationError);
  });

  it("throws ValidationError when subject exceeds 80 chars", () => {
    expect(() =>
      validateLetterOutput({
        subject: "a".repeat(81),
        body: "body",
        reasoning: "",
      })
    ).toThrow(ValidationError);
  });

  it("throws ValidationError when subject contains HTML", () => {
    expect(() =>
      validateLetterOutput({
        subject: "Hello <b>world</b>",
        body: "body",
        reasoning: "",
      })
    ).toThrow(ValidationError);
  });

  it("throws ValidationError when body is empty", () => {
    expect(() =>
      validateLetterOutput({ subject: "Subject", body: "", reasoning: "" })
    ).toThrow(ValidationError);
  });

  it("throws ValidationError when body exceeds 2000 chars", () => {
    expect(() =>
      validateLetterOutput({
        subject: "Subject",
        body: "a".repeat(2001),
        reasoning: "",
      })
    ).toThrow(ValidationError);
  });

  it("throws ValidationError when body contains HTML tags", () => {
    expect(() =>
      validateLetterOutput({
        subject: "Subject",
        body: "Hello <br/> world",
        reasoning: "",
      })
    ).toThrow(ValidationError);
  });

  it("throws ValidationError when output is not an object", () => {
    expect(() => validateLetterOutput("just a string")).toThrow(
      ValidationError
    );
    expect(() => validateLetterOutput(null)).toThrow(ValidationError);
    expect(() => validateLetterOutput(42)).toThrow(ValidationError);
  });

  it("accepts body at exactly 2000 chars", () => {
    const result = validateLetterOutput({
      subject: "Subject",
      body: "a".repeat(2000),
      reasoning: "",
    });
    expect(result.body).toHaveLength(2000);
  });

  it("accepts subject at exactly 80 chars", () => {
    const result = validateLetterOutput({
      subject: "a".repeat(80),
      body: "body",
      reasoning: "",
    });
    expect(result.subject).toHaveLength(80);
  });
});

describe("generateJson error types", () => {
  it("exports TransientLLMError with statusCode", () => {
    const err = new TransientLLMError("rate limited", 429);
    expect(err.statusCode).toBe(429);
    expect(err.name).toBe("TransientLLMError");
  });

  it("exports MalformedJsonError", () => {
    const err = new MalformedJsonError("bad json");
    expect(err.name).toBe("MalformedJsonError");
  });

  it("exports ValidationError", () => {
    const err = new ValidationError("invalid");
    expect(err.name).toBe("ValidationError");
  });
});

describe("generateJson with mocked SDK", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("returns parsed JSON on success", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: '{"subject":"Hi","body":"Hello","reasoning":"test"}' }],
    });
    const { generateJson } = await import("@/lib/llm");
    const result = await generateJson({
      system: "system",
      user: "user",
      model: "claude-haiku-4-5",
    });
    expect(result).toEqual({ subject: "Hi", body: "Hello", reasoning: "test" });
  });

  it("strips markdown code fences from JSON response", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: "```json\n{\"subject\":\"Hi\",\"body\":\"Hello\",\"reasoning\":\"\"}\n```",
        },
      ],
    });
    const { generateJson } = await import("@/lib/llm");
    const result = await generateJson<{ subject: string }>({
      system: "system",
      user: "user",
      model: "claude-haiku-4-5",
    });
    expect(result.subject).toBe("Hi");
  });

  it("throws MalformedJsonError when response is not valid JSON", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "not json at all" }],
    });
    const { generateJson } = await import("@/lib/llm");
    await expect(
      generateJson({ system: "s", user: "u", model: "m" })
    ).rejects.toThrow(MalformedJsonError);
  });

  it("throws TransientLLMError on 429", async () => {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const apiErr = new (
      Anthropic as unknown as { APIError: new (msg: string, status: number) => Error & { status: number } }
    ).APIError("rate limited", 429);
    mockCreate.mockRejectedValue(apiErr);
    const { generateJson } = await import("@/lib/llm");
    await expect(
      generateJson({ system: "s", user: "u", model: "m" })
    ).rejects.toThrow(TransientLLMError);
  });

  it("throws TransientLLMError on 500", async () => {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const apiErr = new (
      Anthropic as unknown as { APIError: new (msg: string, status: number) => Error & { status: number } }
    ).APIError("server error", 500);
    mockCreate.mockRejectedValue(apiErr);
    const { generateJson } = await import("@/lib/llm");
    await expect(
      generateJson({ system: "s", user: "u", model: "m" })
    ).rejects.toThrow(TransientLLMError);
  });

  it("re-throws 4xx APIErrors (non-429) without wrapping", async () => {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const apiErr = new (
      Anthropic as unknown as { APIError: new (msg: string, status: number) => Error & { status: number } }
    ).APIError("bad request", 400);
    mockCreate.mockRejectedValue(apiErr);
    const { generateJson } = await import("@/lib/llm");
    await expect(
      generateJson({ system: "s", user: "u", model: "m" })
    ).rejects.not.toThrow(TransientLLMError);
    await expect(
      generateJson({ system: "s", user: "u", model: "m" })
    ).rejects.toThrow("bad request");
  });

  it("throws MalformedJsonError when response has no text block", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "tool_use", id: "x", name: "y", input: {} }],
    });
    const { generateJson } = await import("@/lib/llm");
    await expect(
      generateJson({ system: "s", user: "u", model: "m" })
    ).rejects.toThrow(MalformedJsonError);
  });

  it("re-throws non-APIError network failures unchanged", async () => {
    mockCreate.mockRejectedValue(new Error("ECONNRESET"));
    const { generateJson } = await import("@/lib/llm");
    await expect(
      generateJson({ system: "s", user: "u", model: "m" })
    ).rejects.toThrow("ECONNRESET");
  });

  it("respects maxTokens override", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: '{"a":1}' }],
    });
    const { generateJson } = await import("@/lib/llm");
    await generateJson({
      system: "s",
      user: "u",
      model: "m",
      maxTokens: 4096,
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 4096 })
    );
  });

  it("passes through cache_control on content blocks", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: '{"a":1}' }],
    });
    const { generateJson } = await import("@/lib/llm");
    await generateJson({
      system: [
        { type: "text", text: "cached system", cache_control: { type: "ephemeral" } },
      ],
      user: [
        { type: "text", text: "brief", cache_control: { type: "ephemeral" } },
        { type: "text", text: "creator" },
      ],
      model: "m",
    });
    const call = mockCreate.mock.calls[0][0];
    expect(call.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(call.messages[0].content[0].cache_control).toEqual({ type: "ephemeral" });
    expect(call.messages[0].content[1].cache_control).toBeUndefined();
  });
});
