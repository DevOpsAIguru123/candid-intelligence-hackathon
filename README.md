# Speaker Signal

Speaker Signal is a working Track 2 prototype for the Candid Intelligence Houston Energy + AI Hackathon. Give it one public conference agenda URL and it produces a ranked speaker list, explainable ICP scores, a "Why Now?" brief, conference-relative outreach drafts, and an eight-stage GTM funnel.

The demo is safe by design: live ingestion is attempted only for public HTTP(S) pages, failures never overwrite existing data, and the bundled fictional conference is always labeled **DEMO DATA**. The application drafts outreach but never sends it.

## Run locally

Requirements:

- Node.js 24 or newer, for native `node:sqlite`.
- pnpm 11 or newer.

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Persistence Configuration

The conference adapter workflows support both PostgreSQL/Supabase and SQLite repositories:
- When `DATABASE_URL` is set in `.env.local` (e.g. `DATABASE_URL=postgresql://...`), the DCWP ingestion and research-task scripts persist to PostgreSQL/Supabase. Run `pnpm db:migrate` before live ingestion to apply the schema.
- When `DATABASE_URL` is absent or empty, those scripts fall back locally to SQLite (`data/speaker-signal.db` or custom `DATABASE_PATH`).
To enable rendered fallback for blocked or JavaScript-only conference pages, add a server-side Firecrawl key to `.env.local`:

```bash
FIRECRAWL_API_KEY=your_key_here
```

The key is never sent to the browser. Direct fetching remains first; Firecrawl is called only when the direct request fails or returns no credible speaker records.

## Demo path

1. Open the overview.
2. Click **Load demo conference** for a deterministic presentation, or paste a public agenda URL and click **Analyze conference**.
3. On the ranked conference page, explain why Maya Torres scores 100.
4. Open Maya's signal brief and show the grounded Why Now recommendation.
5. Scroll through the five drafts anchored at T-14, T-7, T-2, event day, and T+2.
6. Open **Funnel** and show the drop-off from identified to conversation booked.

Suggested three-minute story:

> Buyers tell us who they are in public, but conference agendas are still turned into sales lists by hand. Speaker Signal converts one agenda into a transparent, timed origination motion. It identifies the people, explains why they matter, and tells us when to act—without sending a single message.

## How it works

```text
Conference URL
  -> public URL and DNS safety checks
  -> direct HTML fetch
  -> Firecrawl rendered HTML fallback when configured and needed
  -> HTML and JSON-LD extraction
  -> speaker normalization and conservative deduplication
  -> deterministic ICP scoring
  -> event-relative outreach drafts
  -> atomic PostgreSQL / SQLite workflow persistence
  -> agent-claimable research queue and evidence outputs
```

The adapter and research workflows live in `lib/adapters/`, use an async `ConferenceRepository`, and select PostgreSQL when `DATABASE_URL` is set or SQLite otherwise. They are intentionally isolated from the existing Next.js presentation repository so display work can integrate independently.

The platform supports automated conference live ingestion and agent-claimable research tasks. Each research marker represents one content session or presentation (e.g. Keynote, Session, Workshop, Solutions Spotlight, Tech Talk).

### 1. Live Conference Ingestion

Ingest a live conference agenda (such as Data Center World Power) into the configured workflow repository:

```bash
pnpm dcwp:ingest
```

This command fetches the live conference graph, normalizes sessions and speakers, generates research markers, persists the output, and prints a JSON coverage summary. The DCWP live adapter exhausts 2 session pages, 3 speaker fragments, and the required CSV agenda file, failing closed on any coverage or pagination mismatch.

### 2. Claim Research Task

Autonomous research agents claim pending tasks atomically (`FOR UPDATE SKIP LOCKED` on PostgreSQL/Supabase):

```bash
pnpm research:claim --agent agent-worker-1 [--conference data-center-world-power-2026-09-21]
```

If a pending task is available, it is marked `in_progress` by `agent-worker-1` and prints the session target URL, title, priority, and instructions as JSON.

### 3. Complete Research Task

Agents submit completed research findings by passing their agent ID, task ID, and a JSON output payload file:

```bash
pnpm research:complete --agent agent-worker-1 --task task-123 --output ./findings.json
```

The command validates the versioned research contract, transitions the task status to `complete`, stores the output, and returns the completion result as JSON. Every finding needs a category, precise attribution, an HTTP(S) evidence URL, and a verbatim source quote; unsupported requested facts belong in `unknowns`.

```json
{
  "schemaVersion": "1.0",
  "summary": "Evidence-backed summary of the session and speaker research.",
  "findings": [
    {
      "category": "capacity",
      "statement": "The source reports a 1 GW demand-response commitment.",
      "attribution": "Named author and official source",
      "evidenceUrl": "https://example.com/official-source",
      "evidenceQuote": "Exact supporting source text."
    }
  ],
  "unknowns": ["No supported kV figure was found."]
}
```

## Explainable score

Each rule group awards points at most once, for a maximum of 100:

| Signal | Points |
| --- | ---: |
| VP/head/director/chief seniority | 25 |
| Engineering/project-delivery function | 20 |
| Owner/developer/operator company | 25 |
| Data-center/power/grid topic | 20 |
| Named project, capacity, geography, or active signal | 10 |

Scores of 80–100 are high priority, 60–79 are qualified, and lower scores remain in monitor. Every awarded group stores its reason and matched source text.

## Live versus demo behavior

Live ingestion:

- Accepts only public `http` and `https` URLs.
- Resolves DNS and rejects loopback, private, link-local, multicast, and credential-bearing destinations.
- Follows at most three validated redirects and times out each request after eight seconds.
- Reads Event JSON-LD plus repeated speaker/agenda markup.
- Falls back once to Firecrawl when a configured direct request is blocked, times out, or exposes no speaker records.
- Labels persisted Firecrawl results **LIVE · FIRECRAWL** so provenance remains visible.
- Keeps ambiguous same-name records separate instead of forcing a merge.
- Commits the complete conference graph atomically only after parsing, scoring, and sequencing succeed.

If Firecrawl is not configured—or both extraction attempts fail—the API returns an explicit failure and the interface offers the labeled demo. It never silently substitutes sample data. Firecrawl can render a blocked page, but it cannot supply speaker records that the source page does not contain.

The bundled **Gulf Coast Power & AI Forum 2026** dataset is fictional. Its eight speakers deliberately span every funnel stage so the complete motion is demoable without network access or an LLM key.

## Public data and outreach boundaries

Use only public conference pages and respect each site's terms, robots guidance, and rate limits. The extractor identifies itself as `SpeakerSignal/0.1` and performs a single bounded request during an analysis.

Outreach copy uses only the speaker name, title, company, session, conference, and score evidence already present in the graph. Email drafts include an opt-out sentence. This prototype has no email provider integration and cannot send messages.

## Verification

```bash
pnpm test
pnpm lint
pnpm build
pnpm test:e2e
```

The test suite covers scoring, year-boundary sequence dates, funnel math, parsing, normalization, deduplication, URL safety, fallback behavior, atomic persistence, UI components, and the complete browser journey.

## Current limitations

- Firecrawl renders blocked and JavaScript-heavy pages, but extraction still requires recognizable speaker or Event markup.
- Session association uses nearby agenda structure rather than a site-specific parser registry.
- Funnel advancement is persisted, but the prototype presents seeded states instead of integrating external email telemetry.
- Conference discovery and scheduled refresh are outside the one-day scope.

## What another week unlocks

- Recurring conference discovery and scheduled refresh jobs.
- Browser-based extraction for JavaScript-heavy sites.
- Source evidence links and field-level provenance.
- Company/project enrichment and a small Track 1 join.
- Authentication, team workspaces, and audit history.
- Optional compliant email-provider integration with human approval before sending.
