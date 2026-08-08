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

## Deploy to Vercel

Import the repository and deploy—Next.js needs no build configuration. Two deployment-specific details are already handled in the repo:

- `engines.node` pins **24.x**, which `node:sqlite` requires. Vercel defaults to 24.x, but the pin survives a project-settings override.
- The database path falls back to `/tmp/speaker-signal.db` when `VERCEL` is set, because serverless bundles are mounted read-only. `DATABASE_PATH` still overrides it.

Set `FIRECRAWL_API_KEY` in **Project Settings → Environment Variables** if you want the rendered fallback in production. Do not set `DATABASE_PATH` to a repository-relative path there; only `/tmp` is writable.

**Serverless state is ephemeral.** `/tmp` belongs to a single function instance and is discarded when that instance is recycled, so an analyzed conference can disappear when a request lands on a cold instance. This is fine for a live demo on a warm instance and wrong for anything durable. Point the repository at hosted SQLite (Turso/libSQL) or Postgres before treating deployed state as real.

## Demo path

1. Open the overview.
2. Click **Load demo conference** for a deterministic presentation, or paste a public agenda URL and click **Analyze conference**.
3. Open **Calendar** and show the watchlist: every recurring series counting down on its own clock, projected dates before an agenda exists, and the ingested agenda promoted to a confirmed date with ranked speakers.
4. On the ranked conference page, explain why the top speaker scores 100.
5. Open their signal brief and show the grounded Why Now recommendation.
6. Scroll through the five drafts anchored at T-14, T-7, T-2, event day, and T+2.
7. Open **Progress** and show the drop-off from found to conversation booked.

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

## Conference calendar

`/calendar` is the watchlist view. It merges two sources into one ranked board, soonest event first:

- **Seeded recurring series** (`data/conference-series.ts`) — Data Center World Power, DTECH Data Centers & AI, CERAWeek, POWERGEN, Gastech, Reuters Events, and Infocast. Industry events repeat in the same annual window, so the next edition is projected from that window and appears on the board before an organizer publishes anything. Projected dates are labeled **dates expected** and are never presented as confirmed.
- **Ingested agendas** — any conference already in the repository. It attaches to its series by name token or agenda host, flips the row to **SPEAKERS PUBLISHED** with **dates confirmed**, and shows extracted speaker counts and the top match.

**Every row opens.** Analyzed events go to their speaker workspace; watched events with no speaker list yet get their own page showing expected dates, why they are on the watchlist, and a **Read the speaker list now** button that runs the same ingestion the overview form does. Once it succeeds the event permanently lives at `/conferences/[id]` and the watched page forwards there.

Inside an event, the speaker table is the workspace: fit score, name, title, company, talk, current follow-up step, and per-row controls to add someone to your meet list or move them one step forward. Filter by *Everyone / Worth contacting / On my list* and search by name, company, or talk — real agendas run to hundreds of speakers. The full profile (why now, score evidence, drafts) stays one click away rather than being duplicated in the table.

A small **Month view** button in the board header opens a popup with a conventional month grid: events sit on their real dates, multi-day conferences span every day they run, today is ringed, and a legend lists that month's events. It reads the same entries the board ranks — no separate data path.

Each row runs on its own check interval, tightening as the event approaches: 15 minutes inside two weeks, hourly inside two months, six-hourly inside six months, daily beyond that. The board shows when each source was last checked and when its next check is due, and re-polls `GET /api/calendar` every 30 seconds so a running screen stays current without a reload.

The board is read-only: it reports watch state, it does not perform checks. The scheduled job that walks due sources and re-ingests them is the remaining piece — until it lands, a row's confirmed data comes from an agenda someone analyzed from the overview. `lib/calendar.ts` is pure and fully unit-tested, so the job only has to call the existing ingestion path on the sources the board already marks due.

## Four pages, one owner per number

The app is built for a business team, so every figure appears on exactly one page. If you find the same count in two places, that is a bug.

| Page | Owns | Answers |
| --- | --- | --- |
| **Overview** | nothing — it repeats no count | What do I do next? |
| **Calendar** | events watched, speaker lists out, next event | What is coming up? |
| **My plan** | attendance, people to meet, emails to approve | What did I decide? |
| **Progress** | the eight-step chart | Where do people drop off? |

An event page owns its own people counts (speakers found, worth contacting, on your meet list); a speaker profile owns everything about that one person. The Overview deliberately carries no metric row — it shows the single next action and a one-line "waiting on you" pointer into the plan. The Progress page carries no metric cards either, because the chart beneath them already prints every count.

## Your plan: attendance, meet list, and approvals

Everything the engine produces is a suggestion. `/plan` is where a person decides what to act on:

- **Are you going?** Each event records *going in person*, *not decided*, or *not going*, set from the event page or the plan page.
- **Who to meet.** Press **＋ Meet** beside any speaker to save them, then add a talking point on their profile — "what do you want to discuss?" travels with them onto the plan.
- **Follow-up.** A speaker's profile shows where they are in the eight-step motion and advances them one step at a time; the Progress view reflects it immediately.
- **Approval before anything is sent.** Every drafted email starts at *waiting for approval*. A person approves it or sends it back for changes. `isClearedToSend()` treats only an explicit approval as cleared, and the prototype still has no email provider — approving marks a draft ready for a human to send, nothing more.

These decisions live in their own tables (`event_attendance`, `meet_list`, `draft_approvals`) behind `lib/planning-repository.ts`, on a separate connection from the ingestion repository. That matters: re-analyzing a conference replaces its whole graph atomically, and a human decision must never be deleted as a side effect of a re-scrape.

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

## What the tests cover

This is an internal tool, so the suite only covers things that would break quietly and cost someone a meeting:

| Test | Protects |
| --- | --- |
| `scoring` | the fit score and its 100-point cap |
| `sequence` | email dates anchored to the event, including across a year boundary |
| `normalize` | two different people never merged; one person never contacted twice |
| `url-safety` | the fetcher never reaches a private or internal address |
| `repository` | a conference saves atomically, and stages advance one at a time |
| `planning` | a draft is never "cleared to send" without a person approving it |
| `ingest` | a failed live fetch never silently becomes demo data |
| `calendar` | projected dates roll to the right year, events rank by date, multi-day events span every day |
| `e2e` | the demo journey, the calendar drill-in, and the approval workflow in a real browser |

Tests that only restated a button label were deliberately removed — renaming copy is not a regression, and the browser tests already prove the screens render.

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
- The calendar seeds and ranks recurring series and schedules each source's next check, but nothing walks that schedule yet: re-ingestion is still triggered from the overview. The scheduled worker is the next piece of the calendar, not a redesign of it.
- Series are seeded by hand in `data/conference-series.ts`. A brand-new event from an organizer nobody tracks still needs a human to paste its URL once.

## What another week unlocks

- The scheduled refresh worker behind the calendar, plus new-edition detection when an organizer publishes a date that differs from the projected window.
- Browser-based extraction for JavaScript-heavy sites.
- Source evidence links and field-level provenance.
- Company/project enrichment and a small Track 1 join.
- Authentication, team workspaces, and audit history.
- Optional compliant email-provider integration with human approval before sending.
