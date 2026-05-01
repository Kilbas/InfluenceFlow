import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHtml } from "@/lib/email-render";

const ORIGINAL_APP_URL = process.env.APP_URL;
const ORIGINAL_NEXTAUTH_URL = process.env.NEXTAUTH_URL;

beforeEach(() => {
  process.env.APP_URL = "https://example.test";
  delete process.env.NEXTAUTH_URL;
});

afterEach(() => {
  if (ORIGINAL_APP_URL === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = ORIGINAL_APP_URL;
  if (ORIGINAL_NEXTAUTH_URL === undefined) delete process.env.NEXTAUTH_URL;
  else process.env.NEXTAUTH_URL = ORIGINAL_NEXTAUTH_URL;
});

describe("renderHtml", () => {
  it("returns html and text", async () => {
    const result = await renderHtml({
      bodyText: "Hello there",
      trackingPixelId: null,
    });
    expect(result.html).toContain("<html");
    expect(result.html).toContain("Hello there");
    expect(result.text).toBe("Hello there");
  });

  it("does not include tracking pixel when trackingPixelId is null", async () => {
    const result = await renderHtml({
      bodyText: "No tracking",
      trackingPixelId: null,
    });
    expect(result.html).not.toContain("/api/track/open/");
  });

  it("includes tracking pixel when trackingPixelId provided", async () => {
    const id = "11111111-1111-1111-1111-111111111111";
    const result = await renderHtml({
      bodyText: "Tracked email",
      trackingPixelId: id,
    });
    expect(result.html).toContain(
      `https://example.test/api/track/open/${id}.gif`
    );
  });

  it("falls back to NEXTAUTH_URL when APP_URL is not set", async () => {
    delete process.env.APP_URL;
    process.env.NEXTAUTH_URL = "https://nextauth.test";
    const id = "22222222-2222-2222-2222-222222222222";
    const result = await renderHtml({
      bodyText: "x",
      trackingPixelId: id,
    });
    expect(result.html).toContain(
      `https://nextauth.test/api/track/open/${id}.gif`
    );
  });

  it("strips trailing slash from base URL", async () => {
    process.env.APP_URL = "https://example.test/";
    const id = "33333333-3333-3333-3333-333333333333";
    const result = await renderHtml({
      bodyText: "x",
      trackingPixelId: id,
    });
    expect(result.html).toContain(
      `https://example.test/api/track/open/${id}.gif`
    );
    expect(result.html).not.toContain("test//api");
  });

  it("throws when no base URL is set and trackingPixelId is provided", async () => {
    delete process.env.APP_URL;
    delete process.env.NEXTAUTH_URL;
    await expect(
      renderHtml({
        bodyText: "x",
        trackingPixelId: "44444444-4444-4444-4444-444444444444",
      })
    ).rejects.toThrow(/APP_URL.*NEXTAUTH_URL/);
  });

  it("does not require base URL when trackingPixelId is null", async () => {
    delete process.env.APP_URL;
    delete process.env.NEXTAUTH_URL;
    const result = await renderHtml({
      bodyText: "no pixel",
      trackingPixelId: null,
    });
    expect(result.html).toContain("no pixel");
  });

  it("preserves multi-line body text", async () => {
    const result = await renderHtml({
      bodyText: "Line one\nLine two\nLine three",
      trackingPixelId: null,
    });
    expect(result.text).toBe("Line one\nLine two\nLine three");
    expect(result.html).toContain("Line one");
    expect(result.html).toContain("Line three");
  });

  it("escapes HTML in bodyText (no XSS via injected tags)", async () => {
    const malicious = '<script>alert(1)</script><img onerror="x">';
    const result = await renderHtml({
      bodyText: malicious,
      trackingPixelId: null,
    });
    // Raw text in plaintext output remains unchanged
    expect(result.text).toBe(malicious);
    // HTML output must not contain the literal script tag
    expect(result.html).not.toContain("<script>alert(1)</script>");
    expect(result.html).not.toContain('onerror="x"');
    // The escaped form should be present
    expect(result.html).toContain("&lt;script&gt;");
  });

  it("uses explicit baseUrl param over env", async () => {
    process.env.APP_URL = "https://wrong.test";
    const id = "55555555-5555-5555-5555-555555555555";
    const result = await renderHtml({
      bodyText: "x",
      trackingPixelId: id,
      baseUrl: "https://override.test",
    });
    expect(result.html).toContain(
      `https://override.test/api/track/open/${id}.gif`
    );
    expect(result.html).not.toContain("wrong.test");
  });
});
