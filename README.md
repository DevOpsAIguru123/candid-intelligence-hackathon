# GTM Intelligence Agent

GTM Intelligence Agent is a Go-To-Market AI platform built for the Candid Intelligence Houston Energy + AI Hackathon. Give it one public conference agenda URL and it turns that agenda into a ranked lead & speaker intelligence workspace: explainable ICP scores, grounded "Why Now?" buying signal recommendations, conference-relative outreach drafts, a human-approved action plan, and an eight-stage GTM funnel.

The application reads live conference records only. It never silently substitutes sample data, a failed ingestion never overwrites an existing conference, and drafted outreach is never sent automatically.

## Overview

GTM Intelligence Agent turns a public agenda into an actionable GTM conference plan:

- **Analyze the event.** Extract conference, session, and speaker records from public HTML and JSON-LD, with a rendered Firecrawl fallback when configured.
- **Find the right people.** Normalize and conservatively deduplicate speakers, then rank them with a deterministic 100-point ICP score.
- **Explain the recommendation.** Preserve the matched evidence behind every awarded score group and use it to build a "Why Now?" brief.
- **Plan the interaction.** Save people to a meet list, record attendance and talking points, and review outreach drafts anchored to the event date.
- **Keep a person in control.** Drafts start pending and become ready only after explicit approval. Speaker Signal has no email-provider integration.
- **Track the motion.** Follow each person from identified through conversation booked in an eight-stage funnel.

The application is organized around five destinations:

| Area | Purpose |
| --- | --- |
| **Overview** | Analyze a conference and surface the next recommended action. |
| **Conferences** | Browse analyzed events, open the month view, and search or filter each event's ranked speakers. |
| **Speakers** | Review only the people saved to the meet list or associated with an approved draft. |
| **My plan** | Decide which events to attend, who to meet, what to discuss, and which drafts to approve. |
| **Progress** | Show where tracked people sit in the eight-stage GTM funnel. |

Each number has one owner. Conference-level counts live on conference pages, selected-speaker counts live in the tracked-speaker workspace, decisions live in My plan, and funnel counts live in Progress. The overview stays focused on what to do next instead of repeating metrics from other pages.

## How it works

### Processing pipeline

```text
Conference URL
  -> public URL and DNS safety checks
  -> direct HTML fetch
  -> Firecrawl rendered fallback when configured and needed
  -> HTML and JSON-LD extraction
  -> speaker normalization and conservative deduplication
  -> deterministic ICP scoring
  -> event-relative outreach drafts
  -> atomic PostgreSQL or SQLite persistence
```

The conference adapters implement an async `ConferenceRepository`. `DATABASE_URL` selects PostgreSQL; otherwise the application uses SQLite at `data/speaker-signal.db` or `DATABASE_PATH`. A complete conference graph is committed only after parsing, normalization, scoring, and sequence generation succeed.

Human decisions use separate `event_attendance`, `meet_list`, and `draft_approvals` tables through `lib/planning-repository.ts`. Keeping that state on a separate SQLite connection prevents a conference re-analysis from deleting attendance choices, talking points, or approvals when it atomically replaces the extracted graph.

### Explainable scoring

Each rule group awards points at most once, for a maximum of 100:

| Signal | Points |
| --- | ---: |
| VP/head/director/chief seniority | 25 |
| Engineering/project-delivery function | 20 |
| Owner/developer/operator company | 25 |
| Data-center/power/grid topic | 20 |
| Named project, capacity, geography, or active signal | 10 |

Scores of 80–100 are high priority, 60–79 are qualified, and lower scores remain in monitor. Every awarded group stores its reason and matched source text.

### Research workflow

Conference-specific adapters can generate one research marker for each content session or presentation. Research agents claim pending tasks atomically (`FOR UPDATE SKIP LOCKED` on PostgreSQL), investigate the supplied target, and return a versioned evidence payload.

Every completed finding must include a category, statement, precise attribution, public HTTP(S) evidence URL, and verbatim source quote. Requested facts that cannot be supported belong in `unknowns` rather than an inferred finding.

### Safety and provenance

Live ingestion:

- Accepts only public `http` and `https` URLs.
- Rejects credential-bearing, loopback, private, link-local, and multicast destinations after DNS resolution.
- Follows at most three validated redirects and times out each request after eight seconds.
- Uses Firecrawl once when direct fetching is blocked, times out, or exposes no credible speaker records.
- Labels persisted rendered results **LIVE · FIRECRAWL** so their provenance remains visible.
- Keeps ambiguous same-name records separate instead of forcing a merge.
- Returns an explicit failure when extraction cannot produce credible records.

Use only public conference pages and respect each site's terms, robots guidance, and rate limits. Outreach copy is limited to conference and speaker information already present in the graph, includes an opt-out sentence, and cannot be sent by this application.

## Run and deploy

### Run locally

Requirements:

- Node.js 24 or newer, for native `node:sqlite`.
- pnpm 11 or newer.

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Configure persistence and extraction

Copy `.env.example` to `.env` and fill in the relevant values. `.env.local` remains supported and takes precedence, but keep secrets in one file to avoid accidental overrides:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | No | PostgreSQL/Supabase connection for conference, speaker, sequence, funnel, and research data. |
| `DATABASE_PATH` | No | Custom SQLite path when `DATABASE_URL` is not set. Defaults to `data/speaker-signal.db`. |
| `FIRECRAWL_API_KEY` | No | Server-side rendered fallback for blocked or JavaScript-heavy conference pages. |

When `DATABASE_URL` is set, apply the PostgreSQL schema before ingestion:

```bash
pnpm db:migrate
```

Without `DATABASE_URL`, conference and research workflows use SQLite. Direct fetching always runs first; the Firecrawl key is never sent to the browser.

### Run ingestion and research tasks

Ingest the Data Center World Power conference adapter and print its coverage summary:

```bash
pnpm dcwp:ingest
```

Claim the next pending research task:

```bash
pnpm research:claim --agent agent-worker-1 [--conference data-center-world-power-2026-09-21]
```

Complete a claimed task with a validated JSON evidence payload:

```bash
pnpm research:complete --agent agent-worker-1 --task task-123 --output ./findings.json
```

### Deploy to Vercel

Import the repository into Vercel; Next.js needs no custom build command. The project pins Node 24.x.

Set `DATABASE_URL` and `FIRECRAWL_API_KEY` in **Project Settings → Environment Variables** as needed. When `DATABASE_PATH` is not set, Vercel uses `/tmp/speaker-signal.db` because the deployed bundle is read-only.

**Serverless SQLite state is ephemeral.** A function instance can lose `/tmp` when it is recycled. `DATABASE_URL` makes the extracted conference graph durable, but the current human-planning repository still uses local SQLite. A Vercel deployment is therefore suitable for temporary evaluation, not durable planning state, until all repositories use hosted storage.

## Development status

### Verification

```bash
pnpm test
pnpm lint
pnpm build
pnpm test:e2e
```

The suite protects behavior that could silently corrupt a recommendation or a human decision:

| Area | Contract protected |
| --- | --- |
| Scoring and sequencing | The 100-point cap and outreach dates anchored across event and year boundaries. |
| Parsing and normalization | Credible speaker extraction without merging different people or contacting one person twice. |
| URL safety and ingestion | No private-network fetches, silent sample substitution, or partial overwrite after failure. |
| Persistence and planning | Atomic conference saves, one-step funnel advancement, and explicit approval before a draft is cleared. |
| Calendar | Date ordering, projected-date calculations, refresh intervals, and multi-day month placement. |
| Browser workflows | Real conference drill-in, speaker evidence, saved planning decisions, tracked speakers, and month view. |

### Current limitations

- Extraction still requires recognizable speaker, agenda, or Event markup, even when Firecrawl renders the page.
- Session association uses nearby agenda structure rather than a site-specific parser registry.
- The calendar currently displays analyzed database records; recurring-series watchlists and scheduled re-ingestion do not yet have a persistent worker.
- A new organizer or event must be introduced by pasting a conference URL.
- Funnel advancement is persisted manually; there is no external email telemetry or provider integration.
- Human planning state is SQLite-only even when conference data uses PostgreSQL.
- The prototype has no authentication, team workspaces, roles, or audit history.

### Roadmap

- Add a persistent recurring-series watchlist, scheduled refresh worker, and new-edition detection.
- Expand extraction for JavaScript-heavy and organizer-specific agenda formats.
- Add field-level source provenance and richer company/project enrichment.
- Move planning state to hosted persistence and add authenticated team workspaces with audit history.
- Add optional compliant email-provider integration while preserving explicit human approval.
