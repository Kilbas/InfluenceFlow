import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchCreator, BraveUnavailableError } from "@/lib/search";

const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.BRAVE_SEARCH_API_KEY = "test-key";
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.BRAVE_SEARCH_API_KEY;
});

function makeResponse(opts: {
  ok: boolean;
  status: number;
  body?: unknown;
}): Response {
  return {
    ok: opts.ok,
    status: opts.status,
    json: async () => opts.body ?? {},
  } as unknown as Response;
}

describe("searchCreator", () => {
  it("throws BraveUnavailableError when API key is missing", async () => {
    delete process.env.BRAVE_SEARCH_API_KEY;
    await expect(
      searchCreator({
        displayName: "Alice",
        instagramHandle: "alice",
        niche: "fitness",
      })
    ).rejects.toThrow(BraveUnavailableError);
  });

  it("returns top results from a successful search", async () => {
    fetchMock.mockResolvedValue(
      makeResponse({
        ok: true,
        status: 200,
        body: {
          web: {
            results: [
              { title: "Result 1", url: "https://a.com", description: "x" },
              { title: "Result 2", url: "https://b.com" },
            ],
          },
        },
      })
    );
    const results = await searchCreator({
      displayName: "Alice",
      instagramHandle: "alice",
      niche: "fitness",
    });
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe("Result 1");
  });

  it("returns empty array when web.results is missing", async () => {
    fetchMock.mockResolvedValue(
      makeResponse({ ok: true, status: 200, body: {} })
    );
    const results = await searchCreator({
      displayName: "Bob",
      instagramHandle: "bob",
      niche: "tech",
    });
    expect(results).toEqual([]);
  });

  it("sends X-Subscription-Token header and constructs query", async () => {
    fetchMock.mockResolvedValue(
      makeResponse({ ok: true, status: 200, body: {} })
    );
    await searchCreator({
      displayName: "Charlie",
      instagramHandle: "charlie",
      niche: "food",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("api.search.brave.com");
    expect(url).toContain(encodeURIComponent("Charlie"));
    expect(url).toContain(encodeURIComponent("@charlie"));
    expect(url).toContain(encodeURIComponent("food"));
    expect(url).toContain("count=10");
    expect((init as RequestInit).headers).toMatchObject({
      "X-Subscription-Token": "test-key",
    });
  });

  it("throws BraveUnavailableError on 429", async () => {
    fetchMock.mockResolvedValue(makeResponse({ ok: false, status: 429 }));
    await expect(
      searchCreator({
        displayName: "X",
        instagramHandle: "x",
        niche: "y",
      })
    ).rejects.toThrow(BraveUnavailableError);
  });

  it("throws BraveUnavailableError on 5xx", async () => {
    fetchMock.mockResolvedValue(makeResponse({ ok: false, status: 503 }));
    await expect(
      searchCreator({
        displayName: "X",
        instagramHandle: "x",
        niche: "y",
      })
    ).rejects.toThrow(BraveUnavailableError);
  });

  it("throws BraveUnavailableError on other non-ok responses", async () => {
    fetchMock.mockResolvedValue(makeResponse({ ok: false, status: 400 }));
    await expect(
      searchCreator({
        displayName: "X",
        instagramHandle: "x",
        niche: "y",
      })
    ).rejects.toThrow(BraveUnavailableError);
  });

  it("throws BraveUnavailableError on network failure", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(
      searchCreator({
        displayName: "X",
        instagramHandle: "x",
        niche: "y",
      })
    ).rejects.toThrow(BraveUnavailableError);
  });

  it("URL-encodes special characters in inputs", async () => {
    fetchMock.mockResolvedValue(
      makeResponse({ ok: true, status: 200, body: {} })
    );
    await searchCreator({
      displayName: "Anna & Co",
      instagramHandle: "anna_co",
      niche: "café/food",
    });
    const [url] = fetchMock.mock.calls[0];
    // The raw '&' from "Anna & Co" must NOT appear unescaped in the
    // query value (it would be a query separator). Encoded form must be present.
    expect(url).toContain("%26"); // & encoded
    expect(url).toContain("%2F"); // / encoded
    expect(url).toContain(encodeURIComponent("café"));
  });
});
