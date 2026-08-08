# Speaker Signal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished, demo-safe Track 2 application that turns a public conference URL into ranked speakers, explainable ICP scores, event-relative outreach drafts, and a visible GTM funnel.

**Architecture:** Use one Next.js TypeScript application with route handlers and server components. Keep parser, scoring, sequencing, funnel, URL-safety, and persistence logic in focused domain modules; use native `node:sqlite` behind a repository interface and deterministic demo data when live ingestion cannot produce credible records.

**Tech Stack:** Node.js 24, Next.js, React, TypeScript, native `node:sqlite`, Cheerio, Zod, Vitest, Testing Library, and Playwright.

## Global Constraints

- The application must work without an LLM API key and must never send outreach.
- Live and demo data must be labeled visibly and never confused.
- Only public HTTP(S) URLs may be fetched; loopback and private-network targets are rejected.
- Scoring is deterministic, explainable, capped at 100, and awards each rule group at most once.
- The approved visual system is Signal Room: high contrast, restrained green signal accents, and projector-readable typography. **Superseded 2026-08-08:** the palette was changed from dark surfaces to a standard light interface at the user's request. Layout, type scale, and accent usage are unchanged; only the color tokens in `app/globals.css` differ from the values recorded below.
- The five outreach offsets are `-14`, `-7`, `-2`, `0`, and `+2` days from the conference start date.
- The ordered funnel is `identified`, `qualified`, `contacted`, `replied`, `meeting_scheduled`, `met_at_event`, `follow_up_sent`, `conversation_booked`.
- Use failing tests before writing production behavior, and run the relevant test after every implementation step.

## Planned File Structure

```text
app/
  api/ingest/route.ts             URL ingestion endpoint
  conferences/[id]/page.tsx       ranked conference view
  speakers/[id]/page.tsx          Why Now and outreach view
  funnel/page.tsx                 conversion funnel view
  globals.css                     Signal Room tokens and responsive styling
  layout.tsx                      application shell and sidebar
  page.tsx                        overview and ingest experience
components/
  ingest-form.tsx                 client-side ingestion progress and fallback
  metric-card.tsx                 reusable metric presentation
  score-badge.tsx                 score tier treatment
  sidebar.tsx                     persistent navigation
  funnel-chart.tsx                funnel stages and drop-offs
data/
  demo-conference.ts              labeled CERAWeek-style demo dataset
lib/
  domain.ts                       shared domain types and constants
  normalize.ts                    speaker normalization and deduplication
  parser.ts                       JSON-LD and speaker-card extraction
  scoring.ts                      deterministic ICP scoring
  sequence.ts                     dated drafts and Why Now summary
  funnel.ts                       ordered stage metrics
  url-safety.ts                   URL/DNS SSRF validation
  ingest.ts                       ingestion orchestration and fallback contract
  repository.ts                   repository interface and SQLite implementation
tests/
  fixtures/conference.html        representative agenda markup
  normalize.test.ts
  parser.test.ts
  scoring.test.ts
  sequence.test.ts
  funnel.test.ts
  url-safety.test.ts
  ingest.test.ts
  repository.test.ts
  ui.test.tsx
e2e/demo.spec.ts                  critical browser journey
```

---

### Task 1: Application Shell and Domain Contract

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `vitest.setup.ts`, `playwright.config.ts`
- Create: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
- Create: `components/sidebar.tsx`
- Create: `lib/domain.ts`
- Test: `tests/ui.test.tsx`

**Interfaces:**
- Produces: `Conference`, `Speaker`, `ScoreReason`, `SequenceStep`, `FunnelStage`, `FunnelEvent`, `IngestionStatus`, and `SourceMode` types.
- Produces: root layout with sidebar and a minimal server-rendered overview that later tasks enrich.

- [ ] **Step 1: Create project and test configuration**

Define scripts `dev`, `build`, `lint`, `test`, `test:watch`, and `test:e2e`. Use Next.js App Router, strict TypeScript, Vitest with `jsdom`, and Playwright with a development web server on port 3000.

Install runtime and test dependencies with:

```bash
pnpm add next@latest react@latest react-dom@latest cheerio@latest zod@latest
pnpm add -D typescript@latest @types/node@latest @types/react@latest @types/react-dom@latest eslint@latest eslint-config-next@latest vitest@latest jsdom@latest @vitejs/plugin-react@latest @testing-library/react@latest @testing-library/jest-dom@latest @playwright/test@latest
```

- [ ] **Step 2: Write the failing shell test**

```tsx
it("renders the Signal Room identity and core navigation", () => {
  render(<Sidebar />);
  expect(screen.getByText("SPEAKER SIGNAL")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/");
  expect(screen.getByRole("link", { name: "Funnel" })).toHaveAttribute("href", "/funnel");
});
```

- [ ] **Step 3: Run the shell test and verify RED**

Run: `pnpm test tests/ui.test.tsx`

Expected: FAIL because `components/sidebar.tsx` does not exist.

- [ ] **Step 4: Implement the domain contract and shell**

Define the shared types with ISO date strings at persistence boundaries and `Date` only inside calculation functions. Implement a semantic `<aside>` with Overview, Conferences, Speakers, Sequences, and Funnel links. Add Signal Room CSS tokens: `--bg: #07120f`, `--surface: #10221c`, `--line: #234238`, `--text: #e8f5ec`, `--muted: #86a99a`, `--signal: #7bf1aa`, and `--danger: #ff7b72`.

- [ ] **Step 5: Run focused tests and build**

Run: `pnpm test tests/ui.test.tsx && pnpm build`

Expected: PASS and successful production build.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json next.config.ts vitest.config.ts vitest.setup.ts playwright.config.ts app components/sidebar.tsx lib/domain.ts tests/ui.test.tsx
git commit -m "feat: scaffold Signal Room application shell"
```

### Task 2: Explainable ICP Scoring

**Files:**
- Create: `lib/scoring.ts`
- Create: `tests/scoring.test.ts`

**Interfaces:**
- Consumes: `Speaker` and `ScoreReason` from `lib/domain.ts`.
- Produces: `scoreSpeaker(speaker: Speaker): { score: number; reasons: ScoreReason[]; tier: "high" | "qualified" | "monitor" }`.

- [ ] **Step 1: Write failing scoring tests**

```ts
it("scores a VP engineering speaker on a specific data-center power topic", () => {
  const result = scoreSpeaker(makeSpeaker({
    title: "VP Engineering",
    company: "Frontier Power Development",
    sessionTitle: "Behind-the-Meter Gas Power for a 500 MW AI Campus in Texas",
  }));
  expect(result.score).toBe(100);
  expect(result.reasons.map((reason) => reason.group)).toEqual([
    "seniority", "function", "company", "topic", "specificity",
  ]);
  expect(result.tier).toBe("high");
});

it("does not award one group more than once", () => {
  const result = scoreSpeaker(makeSpeaker({ title: "VP, Head and Director of Engineering" }));
  expect(result.reasons.filter((reason) => reason.group === "seniority")).toHaveLength(1);
  expect(result.score).toBeLessThanOrEqual(100);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm test tests/scoring.test.ts`

Expected: FAIL because `scoreSpeaker` does not exist.

- [ ] **Step 3: Implement minimal deterministic rules**

Use case-insensitive word-boundary patterns and award these exact maxima once: seniority 25, function 20, company 25, topic 20, and specificity 10. Return the matched source text in every reason and classify `>=80` as high, `>=60` as qualified, otherwise monitor.

- [ ] **Step 4: Run tests and commit**

Run: `pnpm test tests/scoring.test.ts`

```bash
git add lib/scoring.ts tests/scoring.test.ts
git commit -m "feat: add explainable ICP scoring"
```

### Task 3: Outreach Timing, Why Now, and Funnel Math

**Files:**
- Create: `lib/sequence.ts`, `lib/funnel.ts`
- Create: `tests/sequence.test.ts`, `tests/funnel.test.ts`

**Interfaces:**
- Consumes: `Conference`, `Speaker`, `ScoreReason`, `SequenceStep`, `FunnelEvent`, and `FunnelStage`.
- Produces: `buildSequence(speaker, conference): SequenceStep[]`.
- Produces: `buildWhyNow(speaker, conference, now): { daysUntil: number; summary: string; action: string }`.
- Produces: `calculateFunnel(events): FunnelMetric[]` with `stage`, `count`, `conversion`, and `dropoff`.
- Produces: `nextFunnelStage(current): FunnelStage | null`.

- [ ] **Step 1: Write failing sequence tests**

```ts
it("anchors five drafts to the conference start date across a year boundary", () => {
  const steps = buildSequence(speaker, conference({ startsAt: "2027-01-05T09:00:00-06:00" }));
  expect(steps.map((step) => step.offsetDays)).toEqual([-14, -7, -2, 0, 2]);
  expect(steps[0].scheduledAt.startsWith("2026-12-22")).toBe(true);
  expect(steps.every((step) => step.message.includes("opt out"))).toBe(true);
});
```

- [ ] **Step 2: Write failing funnel tests**

```ts
it("calculates conversion and drop-off for every ordered stage", () => {
  const result = calculateFunnel(makeEvents({ identified: 10, qualified: 6, contacted: 3 }));
  expect(result[1]).toMatchObject({ stage: "qualified", count: 6, conversion: 60, dropoff: 4 });
  expect(result).toHaveLength(8);
});
```

- [ ] **Step 3: Run both files and verify RED**

Run: `pnpm test tests/sequence.test.ts tests/funnel.test.ts`

Expected: FAIL because the sequence and funnel modules do not exist.

- [ ] **Step 4: Implement minimal calculations and deterministic drafts**

Use calendar-day arithmetic with explicit UTC-safe parsing. Drafts may reference only speaker name, title, company, session title, conference name, and score reason text. `nextFunnelStage` returns only the immediate successor and returns `null` after `conversation_booked`.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm test tests/sequence.test.ts tests/funnel.test.ts`

```bash
git add lib/sequence.ts lib/funnel.ts tests/sequence.test.ts tests/funnel.test.ts
git commit -m "feat: add event sequences and funnel metrics"
```

### Task 4: Speaker Extraction, Normalization, and Deduplication

**Files:**
- Create: `lib/parser.ts`, `lib/normalize.ts`
- Create: `tests/fixtures/conference.html`
- Create: `tests/parser.test.ts`, `tests/normalize.test.ts`

**Interfaces:**
- Produces: `SpeakerCandidate` type in `lib/domain.ts`.
- Produces: `extractConference(html: string, sourceUrl: string): { conference: ConferenceCandidate; speakers: SpeakerCandidate[] }`.
- Produces: `normalizeSpeaker(candidate): SpeakerCandidate & { dedupeKey: string }`.
- Produces: `deduplicateSpeakers(candidates): SpeakerCandidate[]`.

- [ ] **Step 1: Create a representative HTML fixture**

Include Event JSON-LD with name, location, and start/end dates, plus three agenda cards: two duplicate Jane Smith records at ABC Energy and one distinct John Lee record. Include session titles next to each speaker.

- [ ] **Step 2: Write failing parser tests**

```ts
it("extracts event metadata and associates speakers with sessions", () => {
  const result = extractConference(fixture, "https://events.example/agenda");
  expect(result.conference.name).toBe("Grid & AI Power Summit 2026");
  expect(result.speakers[0]).toMatchObject({
    name: "Jane Smith", company: "ABC Energy", sessionTitle: "Behind-the-Meter Power for AI",
  });
});
```

- [ ] **Step 3: Write failing normalization tests**

```ts
it("merges confident within-conference name and company matches", () => {
  const result = deduplicateSpeakers([
    candidate(" Jane  Smith ", "ABC Energy, LLC"),
    candidate("jane smith", "ABC ENERGY"),
  ]);
  expect(result).toHaveLength(1);
});

it("keeps same-name speakers at different companies separate", () => {
  expect(deduplicateSpeakers([
    candidate("Jane Smith", "ABC Energy"), candidate("Jane Smith", "XYZ Power"),
  ])).toHaveLength(2);
});
```

- [ ] **Step 4: Run tests and verify RED**

Run: `pnpm test tests/parser.test.ts tests/normalize.test.ts`

Expected: FAIL because parser and normalization functions do not exist.

- [ ] **Step 5: Implement layered extraction and conservative merging**

Parse Event JSON-LD first. Parse speaker cards via `[data-speaker]`, `.speaker`, `.session-speaker`, and schema.org person properties. A credible person name has at least two alphabetic tokens and no schedule/navigation keywords. Normalize legal company suffixes only for comparison; retain the best original display value.

- [ ] **Step 6: Run tests and commit**

Run: `pnpm test tests/parser.test.ts tests/normalize.test.ts`

```bash
git add lib/domain.ts lib/parser.ts lib/normalize.ts tests/fixtures/conference.html tests/parser.test.ts tests/normalize.test.ts
git commit -m "feat: extract and deduplicate conference speakers"
```

### Task 5: Safe Ingestion and Demo Fallback Contract

**Files:**
- Create: `lib/url-safety.ts`, `lib/ingest.ts`, `data/demo-conference.ts`
- Create: `tests/url-safety.test.ts`, `tests/ingest.test.ts`

**Interfaces:**
- Produces: `assertPublicHttpUrl(rawUrl: string, lookup?: LookupFn): Promise<URL>`.
- Produces: `ingestConference(input, dependencies): Promise<IngestionResult>` with `success`, `conference`, `speakers`, and optional `fallbackAvailable` and `errorCode`.
- Produces: `getDemoConference(): IngestedConference` with `sourceMode: "demo"`.

- [ ] **Step 1: Write failing URL safety tests**

```ts
it.each(["file:///etc/passwd", "http://127.0.0.1", "http://localhost", "http://169.254.169.254"])(
  "rejects non-public target %s",
  async (url) => expect(assertPublicHttpUrl(url, fakeLookup)).rejects.toThrow(/public HTTP/i),
);
```

- [ ] **Step 2: Write failing orchestration tests**

```ts
it("returns a labeled fallback without silently substituting it", async () => {
  const result = await ingestConference({ url: "https://events.example" }, failingDependencies);
  expect(result).toMatchObject({ success: false, fallbackAvailable: true, errorCode: "FETCH_FAILED" });
  expect(result.conference).toBeUndefined();
});
```

- [ ] **Step 3: Run tests and verify RED**

Run: `pnpm test tests/url-safety.test.ts tests/ingest.test.ts`

Expected: FAIL because safety and orchestration functions do not exist.

- [ ] **Step 4: Implement URL validation and orchestration**

Reject non-HTTP protocols, credential-bearing URLs, localhost names, and IPv4/IPv6 loopback, private, link-local, multicast, and unspecified ranges. Resolve hostnames before fetch and validate every returned address. Fetch with an 8-second abort timeout and an explicit `SpeakerSignal/0.1` user agent. Do not write data until parsing, normalization, scoring, and sequencing all succeed.

- [ ] **Step 5: Add realistic bundled demo data**

Create one fictional Houston energy conference with eight speakers across all score tiers and funnel stages. Use conspicuous `sourceMode: "demo"` metadata and no claims about real people or companies.

- [ ] **Step 6: Run tests and commit**

Run: `pnpm test tests/url-safety.test.ts tests/ingest.test.ts`

```bash
git add lib/url-safety.ts lib/ingest.ts data/demo-conference.ts tests/url-safety.test.ts tests/ingest.test.ts
git commit -m "feat: add safe hybrid conference ingestion"
```

### Task 6: SQLite Repository and Ingestion API

**Files:**
- Create: `lib/repository.ts`, `app/api/ingest/route.ts`
- Create: `tests/repository.test.ts`

**Interfaces:**
- Produces: `SpeakerSignalRepository` methods `replaceConference`, `listConferences`, `getConference`, `getSpeaker`, `listSpeakers`, `listFunnelEvents`, and `advanceSpeaker`.
- Produces: `createRepository(path?: string): SpeakerSignalRepository`; `":memory:"` is used in tests.
- API: `POST /api/ingest` accepts `{ url?: string; useDemo?: boolean }` and returns `IngestionResult`.

- [ ] **Step 1: Write failing atomic repository tests**

```ts
it("replaces one conference graph atomically", () => {
  const repository = createRepository(":memory:");
  repository.replaceConference(demoGraph);
  expect(repository.getConference(demoGraph.conference.id)?.sourceMode).toBe("demo");
  expect(repository.listSpeakers(demoGraph.conference.id)).toHaveLength(8);
});

it("advances only to the immediate next funnel stage", () => {
  expect(() => repository.advanceSpeaker(speakerId, "replied")).toThrow(/next stage/i);
});
```

- [ ] **Step 2: Run repository tests and verify RED**

Run: `pnpm test tests/repository.test.ts`

Expected: FAIL because the repository does not exist.

- [ ] **Step 3: Implement schema, transactions, and queries**

Use native `DatabaseSync` with foreign keys enabled. Store reasons as JSON text and use an explicit transaction around conference, speaker, sequence, and funnel replacement. Parameterize every statement.

- [ ] **Step 4: Implement the route handler**

Validate the request body with Zod. `useDemo: true` explicitly persists the demo graph. Live failures return a non-2xx status with `fallbackAvailable: true`; they never persist demo data automatically.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm test tests/repository.test.ts tests/ingest.test.ts`

```bash
git add lib/repository.ts app/api/ingest/route.ts tests/repository.test.ts
git commit -m "feat: persist conference intelligence atomically"
```

### Task 7: Signal Room Product Screens

**Files:**
- Modify: `app/page.tsx`, `app/globals.css`
- Create: `components/ingest-form.tsx`, `components/metric-card.tsx`, `components/score-badge.tsx`, `components/funnel-chart.tsx`
- Create: `app/conferences/[id]/page.tsx`, `app/speakers/[id]/page.tsx`, `app/funnel/page.tsx`
- Modify: `tests/ui.test.tsx`

**Interfaces:**
- Consumes repository read methods and domain calculations from Tasks 2–6.
- Produces: complete overview, conference, speaker, and funnel experience.

- [ ] **Step 1: Add failing UI behavior tests**

```tsx
it("labels demo data and renders the top Why Now signal", async () => {
  render(await OverviewPage());
  expect(screen.getByText("DEMO DATA")).toBeInTheDocument();
  expect(screen.getByText(/Why now/i)).toBeInTheDocument();
});

it("renders every funnel stage", () => {
  render(<FunnelChart metrics={metrics} />);
  expect(screen.getAllByTestId("funnel-stage")).toHaveLength(8);
});
```

- [ ] **Step 2: Run UI tests and verify RED**

Run: `pnpm test tests/ui.test.tsx`

Expected: FAIL because the completed components and pages do not exist.

- [ ] **Step 3: Build the ingest interaction**

Implement URL submission with visible `Fetching`, `Extracting`, `Scoring`, `Sequencing`, and `Complete` steps. On API failure, show the error and an explicit `Load demo conference` button. Redirect successful ingestion to `/conferences/{id}`.

- [ ] **Step 4: Build all four responsive screens**

Use semantic tables and links, score-tier badges, source/time metadata, sequence status pills, and a CSS funnel that shows counts plus conversion/drop-off labels. Ensure narrow screens collapse the sidebar and cards without horizontal overflow.

- [ ] **Step 5: Run UI tests, lint, and build**

Run: `pnpm test tests/ui.test.tsx && pnpm lint && pnpm build`

Expected: all commands pass without errors.

- [ ] **Step 6: Commit**

```bash
git add app components tests/ui.test.tsx
git commit -m "feat: build Signal Room product experience"
```

### Task 8: Browser Journey, Documentation, and Final Verification

**Files:**
- Create: `e2e/demo.spec.ts`, `README.md`, `.env.example`
- Modify: `package.json` only if the final verification needs script adjustments.

**Interfaces:**
- Produces: a repeatable demo journey and hackathon-ready runbook.

- [ ] **Step 1: Write the failing browser test**

```ts
test("loads demo data and reaches ranked speaker, sequence, and funnel", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Load demo conference" }).click();
  await expect(page.getByText("DEMO DATA")).toBeVisible();
  await page.getByRole("link", { name: /View Jane Smith/i }).click();
  await expect(page.getByText("Why now?", { exact: false })).toBeVisible();
  await expect(page.getByTestId("sequence-step")).toHaveCount(5);
  await page.getByRole("link", { name: "Funnel" }).click();
  await expect(page.getByTestId("funnel-stage")).toHaveCount(8);
});
```

- [ ] **Step 2: Run Playwright and verify RED**

Run: `pnpm test:e2e`

Expected: FAIL at the first missing or incorrect demo interaction.

- [ ] **Step 3: Fix only the gaps exposed by the browser test**

Make accessible names, redirects, seeded data, and selectors match the demonstrated user journey. Do not add deferred features.

- [ ] **Step 4: Write the README and environment example**

Document prerequisites, install/start/test commands, the live-versus-demo behavior, public sources and terms caveat, scoring weights, three-minute demo script, current limitations, and the next-week roadmap. `.env.example` contains only optional `DATABASE_PATH` and no secrets.

- [ ] **Step 5: Run the full verification suite**

Run: `pnpm test && pnpm lint && pnpm build && pnpm test:e2e`

Expected: zero failed tests, zero lint errors, successful production build, and passing browser journey.

- [ ] **Step 6: Inspect the working tree and commit**

```bash
git status --short
git add README.md .env.example e2e/demo.spec.ts package.json
git commit -m "test: verify Speaker Signal demo journey"
```

- [ ] **Step 7: Final requirement audit**

Re-read `docs/superpowers/specs/2026-08-07-speaker-signal-design.md` and confirm every acceptance criterion has implementation evidence in the test output or browser journey. Report any unmet criterion explicitly instead of claiming completion.
