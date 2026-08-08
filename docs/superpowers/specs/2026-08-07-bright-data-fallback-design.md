# Bright Data Fallback Design

## Summary

Speaker Signal will replace its unusable Firecrawl runtime fallback with Bright Data Unlocker API. Direct public-page fetching remains the first and cheapest path. Bright Data runs only when the direct request is blocked, times out, or returns no credible speaker records. If both paths fail, the application preserves existing data and offers the explicitly labeled demo conference.

## Goals

- Recover HTML from blocked and JavaScript-heavy public conference pages.
- Avoid Firecrawl credit failures and unnecessary provider chaining.
- Keep Bright Data credentials exclusively on the server.
- Preserve the current public-URL and DNS safety checks.
- Make Bright Data provenance visible after persistence and navigation.
- Retain deterministic parsing, scoring, sequencing, and demo behavior.

## Non-goals

- Bypassing authentication, paywalls, or access controls.
- Crawling whole conference sites or following arbitrary links.
- Adding local browser automation or Crawl4AI.
- Inventing speaker data absent from the source page.
- Sending outreach.

## Architecture and Data Flow

```text
Conference URL
  -> validate public HTTP(S) URL and resolved address
  -> bounded direct fetch
  -> parse speaker and event markup
  -> when blocked or no credible speakers:
       Bright Data Unlocker API
       -> rendered raw HTML
       -> existing parser
  -> normalize, score, sequence, and persist atomically
  -> label source as LIVE · BRIGHT DATA
```

The server calls `POST https://api.brightdata.com/request` using a bearer API key and an active Unlocker zone. The request asks for `format: raw` so the response can enter the existing HTML parser without introducing provider-specific extraction logic.

## Configuration

The ignored `.env.local` file stores:

```text
BRIGHTDATA_API_KEY=
BRIGHTDATA_ZONE=
```

The supplied key will be used once during implementation to query Bright Data's account endpoint for active zones. The selected Unlocker zone name is then stored locally rather than rediscovered during every ingestion. Neither value is returned to the browser, written to logs, or committed.

If either configuration value is absent, ingestion behaves as direct-only and offers the demo after a direct failure.

## Provider Behavior

Provider order is fixed:

1. Direct fetch.
2. Bright Data Unlocker API, only if configured and needed.
3. Explicit demo offer.

Firecrawl is removed from the runtime path, and its client, tests, configuration entry, and local key are removed. This prevents extra latency, eliminates an already-known insufficient-credit request, and keeps the prototype focused on one managed fallback.

Bright Data receives only the URL that already passed the application's URL/DNS validation. It gets a 30-second timeout and performs one attempt per user-triggered analysis. Successful Bright Data conferences use `sourceMode: brightdata`, rendered as **LIVE · BRIGHT DATA**.

## Error Handling

- Invalid or private URL: reject before direct or Bright Data requests.
- Direct failure without Bright Data configuration: explain that live fallback is not configured.
- Bright Data authentication, zone, quota, or retrieval failure: return a generic actionable provider message without exposing response bodies or credentials.
- No credible speakers after Bright Data: report unsupported source content.
- Missing event date: preserve the existing explicit failure.
- Any ingestion failure: preserve previously stored conference data and offer the labeled demo.

Bright Data can retrieve or render a page but cannot create speaker records that are absent from the source.

## Testing

Tests will verify:

- The Bright Data client sends the documented endpoint, bearer header, zone, target URL, and raw format.
- The client returns HTML and surfaces safe provider failures.
- A blocked direct request succeeds through Bright Data.
- Direct success does not spend a Bright Data request.
- Direct markup with no speakers receives one Bright Data retry.
- Missing configuration preserves direct-only behavior.
- Persisted provider provenance formats as **LIVE · BRIGHT DATA**.
- Existing unit, lint, production build, and browser suites remain green.

One live diagnostic will query the active zone and attempt the supplied AllConferenceAlert URL. The result will be summarized without printing credentials or fetched page content.

## Acceptance Criteria

- No Firecrawl runtime request occurs during ingestion.
- Bright Data runs only after a validated direct failure or unusable direct markup.
- Successful provider results flow through the existing deterministic pipeline.
- Provider provenance remains visible in overview and conference pages.
- Secrets remain ignored and absent from Git history.
- Automated verification passes, with any source-content limitation reported honestly.
