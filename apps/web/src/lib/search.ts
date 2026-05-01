const BRAVE_SEARCH_URL =
  "https://api.search.brave.com/res/v1/web/search";

export class BraveUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BraveUnavailableError";
  }
}

export interface BraveSearchResult {
  title: string;
  url: string;
  description?: string;
}

export interface SearchCreatorParams {
  displayName: string;
  instagramHandle: string;
  niche: string;
}

export async function searchCreator(
  params: SearchCreatorParams
): Promise<BraveSearchResult[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) throw new BraveUnavailableError("BRAVE_SEARCH_API_KEY is not set");

  const query = `${params.displayName} @${params.instagramHandle} ${params.niche} instagram OR youtube OR podcast OR interview`;
  const url = `${BRAVE_SEARCH_URL}?q=${encodeURIComponent(query)}&count=10`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
    });
  } catch (err) {
    throw new BraveUnavailableError(
      `Brave Search network error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (response.status === 429 || response.status >= 500) {
    throw new BraveUnavailableError(
      `Brave Search unavailable (HTTP ${response.status})`
    );
  }

  if (!response.ok) {
    throw new BraveUnavailableError(
      `Brave Search error (HTTP ${response.status})`
    );
  }

  const data = (await response.json()) as {
    web?: { results?: BraveSearchResult[] };
  };
  return data.web?.results ?? [];
}
