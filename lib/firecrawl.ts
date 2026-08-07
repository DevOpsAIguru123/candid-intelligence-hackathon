interface FirecrawlFetchOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
}

interface FirecrawlScrapeResponse {
  success?: boolean;
  data?: {
    rawHtml?: string;
    html?: string;
  };
  error?: string;
}

export async function fetchFirecrawlHtml(
  url: URL,
  options: FirecrawlFetchOptions,
): Promise<string> {
  const response = await (options.fetchImpl ?? fetch)("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    headers: {
      authorization: `Bearer ${options.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      url: url.toString(),
      formats: ["rawHtml"],
      onlyMainContent: false,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as FirecrawlScrapeResponse;
  if (!response.ok) {
    throw new Error(payload.error || `Firecrawl returned ${response.status}`);
  }

  if (!payload.success) {
    throw new Error(payload.error || "Firecrawl scrape failed");
  }

  const html = payload.data?.rawHtml || payload.data?.html;
  if (!html?.trim()) {
    throw new Error("Firecrawl did not return HTML");
  }
  return html;
}
