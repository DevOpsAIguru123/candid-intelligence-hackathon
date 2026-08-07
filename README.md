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

The SQLite database defaults to `data/speaker-signal.db`. To use another location, copy `.env.example` to `.env.local` and change `DATABASE_PATH`.

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
  -> HTML and JSON-LD extraction
  -> speaker normalization and conservative deduplication
  -> deterministic ICP scoring
  -> event-relative outreach drafts
  -> atomic SQLite persistence
  -> overview, conference, speaker, and funnel views
```

The app uses a single Next.js TypeScript codebase. Domain modules in `lib/` do not depend on React, and the SQLite repository is the boundary between ingestion and presentation.

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
- Keeps ambiguous same-name records separate instead of forcing a merge.
- Commits the complete conference graph atomically only after parsing, scoring, and sequencing succeed.

If a page is blocked, JavaScript-only, unsupported, or missing an event date, the API returns an explicit failure and the interface offers the labeled demo. It never silently substitutes sample data.

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

- Static HTML and embedded JSON-LD are supported; JavaScript-only agendas need a browser extraction adapter.
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
