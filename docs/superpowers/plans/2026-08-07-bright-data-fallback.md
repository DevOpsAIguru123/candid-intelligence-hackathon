# Bright Data Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the failing Firecrawl runtime fallback with Bright Data Unlocker API while preserving direct-first ingestion, SSRF protection, deterministic parsing, and the labeled demo.

**Architecture:** A focused `lib/brightdata.ts` client will accept an already-validated public URL and return raw HTML from Bright Data's synchronous Unlocker endpoint. The ingestion orchestrator will call it only after a direct fetch failure or directly fetched markup with no credible speakers, persist provider provenance as `brightdata`, and otherwise retain existing parser/scoring behavior.

**Tech Stack:** Next.js 16.3, TypeScript 5.9, native `fetch`, Vitest 4, Playwright 1.62, Bright Data Unlocker REST API.

## Global Constraints

- Provider order is exactly direct fetch, Bright Data when configured and needed, then explicit demo offer.
- Validate the public HTTP(S) URL and resolved address before either network path.
- Keep `BRIGHTDATA_API_KEY` and `BRIGHTDATA_ZONE` server-only in ignored `.env.local`.
- Remove Firecrawl client code, tests, configuration, documentation, and runtime calls.
- Do not bypass authentication, paywalls, or access controls.
- Do not invent speaker data absent from the source page.
- Perform one Bright Data attempt with a 30-second timeout per user-triggered analysis.
- Preserve atomic persistence and deterministic parsing, scoring, sequencing, and outreach behavior.

---

## File Structure

- Create `lib/brightdata.ts`: synchronous Unlocker HTTP boundary and safe response decoding.
- Create `tests/brightdata.test.ts`: provider contract and failure behavior.
- Modify `lib/ingest.ts`: direct-first provider orchestration.
- Modify `lib/domain.ts`: replace `firecrawl` provenance with `brightdata`.
- Modify `lib/source-mode.ts`: display `LIVE · BRIGHT DATA`.
- Modify `tests/ingest.test.ts`: fallback ordering and configuration behavior.
- Modify `tests/source-mode.test.ts`: visible provenance contract.
- Delete `lib/firecrawl.ts` and `tests/firecrawl.test.ts`.
- Modify `.env.example`, `README.md`, and the primary design spec: configuration and architecture documentation.
- Modify ignored `.env.local`: supplied Bright Data credential and discovered active Unlocker zone; never stage this file.

### Task 1: Bright Data Unlocker Client and Local Configuration

**Files:**
- Create: `lib/brightdata.ts`
- Create: `tests/brightdata.test.ts`
- Modify ignored file: `.env.local`

**Interfaces:**
- Consumes: a `URL`, API key, zone name, and optional `typeof fetch` test double.
- Produces: `fetchBrightDataHtml(url: URL, options: BrightDataFetchOptions): Promise<string>`.

- [ ] **Step 1: Store the supplied credential locally without exposing it**

Use `apply_patch` to add `BRIGHTDATA_API_KEY` to `.env.local`. Do not print the file afterward. Confirm only that Git ignores it:

```bash
git check-ignore -q .env.local
```

Expected: exit 0.

- [ ] **Step 2: Discover the active Unlocker zone with a sanitized diagnostic**

Run a short Node command with `--env-file=.env.local` that calls `GET https://api.brightdata.com/zone/get_all_zones`, filters the returned array to entries whose `type` is `unblocker` and `status` is `active`, and prints only their `name` values. Never print headers, the key, or the full response.

Expected: one active zone name. Add it to ignored `.env.local` as `BRIGHTDATA_ZONE`. If the key is rejected or no active Unlocker zone exists, report that external account blocker instead of inventing a zone.

- [ ] **Step 3: Write failing client contract tests**

Create `lib/brightdata.ts` as a nonfunctional compile stub:

```ts
export interface BrightDataFetchOptions {
  apiKey: string;
  zone: string;
  fetchImpl?: typeof fetch;
}

export async function fetchBrightDataHtml(
  _url: URL,
  _options: BrightDataFetchOptions,
): Promise<string> {
  throw new Error("Not implemented");
}
```

Then create `tests/brightdata.test.ts` with:

```ts
import { describe, expect, it, vi } from "vitest";
import { fetchBrightDataHtml } from "@/lib/brightdata";

describe("fetchBrightDataHtml", () => {
  it("returns HTML from the synchronous Unlocker API", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("<html><body>Rendered agenda</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    const html = await fetchBrightDataHtml(new URL("https://events.example/agenda"), {
      apiKey: "test-api-key",
      zone: "test-unlocker",
      fetchImpl,
    });

    expect(html).toBe("<html><body>Rendered agenda</body></html>");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.brightdata.com/request",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer test-api-key" }),
        body: JSON.stringify({
          zone: "test-unlocker",
          url: "https://events.example/agenda",
          format: "raw",
        }),
      }),
    );
  });

  it("accepts a JSON response envelope containing body HTML", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ status_code: 200, body: "<html>Agenda</html>" }),
    );
    await expect(fetchBrightDataHtml(new URL("https://events.example"), {
      apiKey: "test-api-key",
      zone: "test-unlocker",
      fetchImpl,
    })).resolves.toBe("<html>Agenda</html>");
  });

  it("surfaces a safe error when Unlocker returns no HTML", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ error: "Invalid zone" }, { status: 400 }));
    await expect(fetchBrightDataHtml(new URL("https://events.example"), {
      apiKey: "test-api-key",
      zone: "bad-zone",
      fetchImpl,
    })).rejects.toThrow("Bright Data request failed");
  });
});
```

- [ ] **Step 4: Run the client test and verify RED**

Run:

```bash
npm test -- tests/brightdata.test.ts
```

Expected: FAIL because `fetchBrightDataHtml` throws `Not implemented` instead of satisfying the API contract.

- [ ] **Step 5: Implement the minimal client**

Create `lib/brightdata.ts` with:

```ts
export interface BrightDataFetchOptions {
  apiKey: string;
  zone: string;
  fetchImpl?: typeof fetch;
}

interface BrightDataEnvelope {
  body?: string;
  error?: string;
}

export async function fetchBrightDataHtml(
  url: URL,
  options: BrightDataFetchOptions,
): Promise<string> {
  const response = await (options.fetchImpl ?? fetch)("https://api.brightdata.com/request", {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    headers: {
      authorization: `Bearer ${options.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ zone: options.zone, url: url.toString(), format: "raw" }),
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? ((await response.json().catch(() => ({}))) as BrightDataEnvelope)
    : await response.text();
  const html = typeof payload === "string" ? payload : payload.body;

  if (!response.ok || !html?.trim()) {
    throw new Error("Bright Data request failed");
  }
  return html;
}
```

- [ ] **Step 6: Run the client test and verify GREEN**

Run:

```bash
npm test -- tests/brightdata.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 7: Commit the provider boundary**

```bash
git add lib/brightdata.ts tests/brightdata.test.ts
git commit -m "feat: add Bright Data unlocker client"
```

Confirm `.env.local` is absent from `git status --short` before committing.

### Task 2: Replace Firecrawl in the Ingestion Pipeline

**Files:**
- Modify: `lib/domain.ts`
- Modify: `lib/ingest.ts`
- Modify: `lib/source-mode.ts`
- Modify: `tests/ingest.test.ts`
- Modify: `tests/source-mode.test.ts`
- Delete: `lib/firecrawl.ts`
- Delete: `tests/firecrawl.test.ts`

**Interfaces:**
- Consumes: `fetchBrightDataHtml(url, { apiKey, zone })` from Task 1 and existing validated URLs/parser pipeline.
- Produces: `sourceMode: "brightdata"`, dependency seam `fetchBrightDataHtml?: (url: URL) => Promise<string>`, and visible label `LIVE · BRIGHT DATA`.

- [ ] **Step 1: Write failing orchestration and provenance tests**

Change the Firecrawl cases in `tests/ingest.test.ts` to Bright Data and add the configuration contract:

```ts
it("uses Bright Data after a direct fetch is blocked", async () => {
  const result = await ingestConference(
    { url: "https://events.example" },
    {
      validateUrl: async (rawUrl) => new URL(rawUrl),
      fetchHtml: async () => { throw new Error("blocked"); },
      fetchBrightDataHtml: async () => fixture,
      now: () => new Date("2026-08-07T12:00:00.000Z"),
    },
  );
  expect(result.success).toBe(true);
  if (!result.success) throw new Error("Expected Bright Data ingestion to succeed");
  expect(result.conference.sourceMode).toBe("brightdata");
});
```

In the environment-backed test, stub both `BRIGHTDATA_API_KEY` and `BRIGHTDATA_ZONE`, stub global `fetch` with the documented Bright Data HTML response, and expect `sourceMode` to be `brightdata`. Preserve tests proving direct success does not invoke the provider and no-speaker direct markup retries once.

Change `tests/source-mode.test.ts` to expect:

```ts
expect(formatSourceMode("brightdata")).toBe("LIVE · BRIGHT DATA");
```

- [ ] **Step 2: Run targeted tests and verify RED**

Run:

```bash
npm test -- tests/ingest.test.ts tests/source-mode.test.ts
```

Expected: FAIL because Bright Data dependency and provenance are not implemented.

- [ ] **Step 3: Implement Bright Data orchestration**

In `lib/domain.ts`, change:

```ts
export type SourceMode = "live" | "brightdata" | "demo";
```

In `lib/ingest.ts`:

- Replace the Firecrawl import with `fetchBrightDataHtml as unlockWithBrightData` from `@/lib/brightdata`.
- Replace `fetchFirecrawlHtml` in `IngestionDependencies` with `fetchBrightDataHtml`.
- Read trimmed `BRIGHTDATA_API_KEY` and `BRIGHTDATA_ZONE`.
- Create the default provider only when both values exist.
- Use `let sourceMode: "live" | "brightdata" = "live"`.
- Preserve direct-first, blocked-fetch fallback, and no-speaker fallback branches.
- Return an actionable generic message containing `Bright Data fallback failed` when configured provider retrieval fails.

In `lib/source-mode.ts`, map `brightdata` to `LIVE · BRIGHT DATA`. In `app/globals.css`, replace `.mode-firecrawl` with `.mode-brightdata`.

Delete `lib/firecrawl.ts` and `tests/firecrawl.test.ts` with `apply_patch`.

- [ ] **Step 4: Run targeted tests and verify GREEN**

Run:

```bash
npm test -- tests/brightdata.test.ts tests/ingest.test.ts tests/source-mode.test.ts
```

Expected: all provider, orchestration, and provenance tests pass.

- [ ] **Step 5: Commit the pipeline replacement**

```bash
git add lib app/globals.css tests
git commit -m "feat: use Bright Data ingestion fallback"
```

### Task 3: Documentation, Live Diagnostic, and Full Verification

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-07-speaker-signal-design.md`
- Modify ignored file: `.env.local`

**Interfaces:**
- Consumes: completed Bright Data ingestion path from Task 2.
- Produces: operator setup instructions and verified end-to-end behavior.

- [ ] **Step 1: Replace provider configuration documentation**

Set `.env.example` to include:

```dotenv
# Optional. Enables the Bright Data fallback only when both values are set.
BRIGHTDATA_API_KEY=
BRIGHTDATA_ZONE=
```

Remove `FIRECRAWL_API_KEY`. Update `README.md` and the primary Speaker Signal design spec so their flow is direct fetch → Bright Data fallback → existing parser. Document `LIVE · BRIGHT DATA`, server-only credentials, and the limitation that Unlocker cannot supply absent speaker data.

- [ ] **Step 2: Run the live provider diagnostic without exposing secrets or content**

Restart the development server so it reloads `.env.local`. Send the corrected URL `https://www.allconferencealert.com/event/2153923` to local `POST /api/ingest`. Pipe the response to `jq` and print only `success`, `errorCode`, `message`, `conference.sourceMode`, `conference.name`, and the speaker count.

Expected when the source exposes supported records: `success` is `true`, `sourceMode` is `brightdata`, and the speaker count is greater than zero. If retrieval succeeds but parsing reports no speakers, record `UNSUPPORTED_MARKUP` as the honest live result; do not change the parser to manufacture records.

- [ ] **Step 3: Run complete verification**

Run:

```bash
npm test
npm run lint
npm run build
npm run test:e2e
git diff --check
```

Expected: 0 unit failures, lint exit 0, TypeScript production build exit 0, one Chromium E2E pass, and no whitespace errors.

- [ ] **Step 4: Verify secret safety**

Run commands that report booleans only:

```bash
git check-ignore -q .env.local
git grep -q 'BRIGHTDATA_API_KEY=' HEAD && echo CONFIG_NAME_PRESENT
git grep -Eq 'BRIGHTDATA_API_KEY=[^[:space:]]' HEAD && echo TRACKED_SECRET_FOUND || echo TRACKED_SECRET_CLEAR
```

Expected: `.env.local` is ignored, the documented configuration name may be present, and output ends with `TRACKED_SECRET_CLEAR`.

- [ ] **Step 5: Commit documentation**

```bash
git add .env.example README.md docs/superpowers/specs/2026-08-07-speaker-signal-design.md
git commit -m "docs: document Bright Data fallback"
```

Never stage `.env.local`.
