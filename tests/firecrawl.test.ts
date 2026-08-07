import { describe, expect, it, vi } from "vitest";

import { fetchFirecrawlHtml } from "@/lib/firecrawl";

describe("fetchFirecrawlHtml", () => {
  it("returns rendered raw HTML from the Firecrawl v2 scrape API", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: { rawHtml: "<html><body>Rendered agenda</body></html>" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const html = await fetchFirecrawlHtml(new URL("https://events.example/agenda"), {
      apiKey: "test-api-key",
      fetchImpl,
    });

    expect(html).toBe("<html><body>Rendered agenda</body></html>");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.firecrawl.dev/v2/scrape",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer test-api-key" }),
        body: JSON.stringify({
          url: "https://events.example/agenda",
          formats: ["rawHtml"],
          onlyMainContent: false,
        }),
      }),
    );
  });

  it("rejects a successful response that contains no HTML", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, data: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      fetchFirecrawlHtml(new URL("https://events.example/agenda"), {
        apiKey: "test-api-key",
        fetchImpl,
      }),
    ).rejects.toThrow("did not return HTML");
  });

  it("surfaces Firecrawl API errors such as exhausted credits", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ success: false, error: "Insufficient credits to perform this request." }),
        { status: 402, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      fetchFirecrawlHtml(new URL("https://events.example/agenda"), {
        apiKey: "test-api-key",
        fetchImpl,
      }),
    ).rejects.toThrow("Insufficient credits");
  });
});
