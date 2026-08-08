# Speaker Signal Prototype Design

## Summary

Speaker Signal is a one-day Track 2 prototype for the Candid Intelligence Houston Energy + AI Hackathon. A user submits one public conference URL and receives a ranked, deduplicated list of relevant speakers, a transparent ICP score for each person, conference-relative outreach drafts, and a visible conversion funnel.

The product prioritizes a compelling, reliable demonstration without misrepresenting sample data as live data. It attempts live ingestion first and offers a clearly labeled bundled conference dataset when a site blocks scraping, changes structure, or yields no credible speakers.

## Goals

- Turn a conference URL into structured conference, speaker, company, role, and session data.
- Rank speakers using deterministic and explainable ICP rules.
- Make timing explicit with a high-impact "Why Now?" signal.
- Generate personalized drafts anchored to the conference date.
- Show the GTM motion and its leakage in a funnel.
- Deliver a polished, memorable interface that works without an LLM key.
- Preserve a credible path from prototype to production services.

## Non-goals

- Sending email or connecting to an email provider.
- Authentication, teams, roles, or multi-tenant data isolation.
- Autonomous recurring conference discovery.
- Broad external person, company, or project enrichment.
- A full Track 1 project intelligence implementation.
- Guaranteed parsing of every conference website.

## Recommended Approach

Build a unified Next.js TypeScript application with server-side route handlers, a small SQLite data store, deterministic domain services, and an optional LLM adapter. A single application minimizes deployment and integration overhead while preserving clean internal boundaries.

Alternatives considered:

1. Next.js plus FastAPI offers stronger process separation but adds cross-origin, startup, schema, and deployment overhead that does not improve the one-day demonstration.
2. A static dashboard with scripted ingestion maximizes visual reliability but does not adequately demonstrate URL-to-signal liveness.

## Experience and Visual Direction

The selected visual direction is **Signal Room**: a dark, high-contrast intelligence workspace with restrained green signal accents. It should feel operational rather than decorative and remain legible on a projector.

Persistent sidebar navigation exposes four product areas:

1. **Overview** contains the URL ingest control, live/demo source badge, aggregate metrics, upcoming conferences, and the highest-value Why Now signals.
2. **Conference** contains event metadata, ingestion status, filters, and a ranked speaker table. Selecting a speaker opens their profile.
3. **Speaker** contains the transparent score breakdown, evidence-backed reasons, session details, recommended action, and editable outreach timeline.
4. **Funnel** contains counts, conversions, and drop-off rates across the complete GTM motion.

The primary demonstration follows this path:

1. Open the overview and submit a conference URL.
2. Observe `Fetching`, `Extracting`, `Scoring`, `Sequencing`, and `Complete` progress.
3. Review the ranked conference results.
4. Open the strongest speaker and explain their Why Now signal.
5. Review event-relative outreach drafts.
6. Finish on the funnel and show where the motion leaks.

## Architecture

```text
Browser
  -> Next.js pages and components
  -> Next.js route handlers
     -> ingestion orchestrator
        -> HTTP fetcher
        -> optional Firecrawl rendered fallback
        -> HTML/JSON-LD extractor
        -> normalizer and deduplicator
        -> deterministic ICP scorer
        -> outreach sequence generator
     -> SQLite repository
     -> optional LLM draft adapter
```

The domain services are isolated from both the UI and persistence:

- `extractSpeakers(document)` converts page content into candidate records.
- `normalizeSpeaker(candidate)` produces stable normalized fields and a dedupe key.
- `deduplicateSpeakers(candidates)` merges only confident matches within one conference.
- `scoreSpeaker(speaker)` returns the numeric score, awarded rules, and evidence.
- `buildSequence(speaker, conference)` returns scheduled steps and grounded drafts.
- `calculateFunnel(events)` returns counts, conversions, and drop-offs.

These interfaces allow the parser, database, and LLM provider to change independently.

## Data Model

### Conference

- `id`
- `name`
- `sourceUrl`
- `location`
- `startsAt`
- `endsAt`
- `sourceMode`: `live`, `firecrawl`, or `demo`
- `ingestionStatus`
- `lastIngestedAt`

### Speaker

- `id`
- `conferenceId`
- `name`
- `title`
- `company`
- `sessionTitle`
- `score`
- `scoreReasons`
- `dedupeKey`

### SequenceStep

- `id`
- `speakerId`
- `offsetDays`
- `scheduledAt`
- `channel`
- `status`
- `subject`
- `message`

### FunnelEvent

- `id`
- `speakerId`
- `stage`
- `occurredAt`

Funnel stages are ordered as `identified`, `qualified`, `contacted`, `replied`, `meeting_scheduled`, `met_at_event`, `follow_up_sent`, and `conversation_booked`.

## Ingestion and Extraction

The ingestion route accepts only public `http` or `https` URLs. It rejects malformed URLs and private or loopback destinations before fetching.

The live parser uses a layered strategy:

1. Fetch the page with a bounded timeout and an explicit user agent.
2. When configured, retry once through Firecrawl if the direct request is blocked, times out, or exposes no credible speaker records.
3. Prefer structured JSON-LD and embedded event data when present.
4. Parse repeated speaker cards and agenda/session structures.
5. Associate a speaker with the nearest credible session title.
6. Normalize whitespace, titles, organization names, and person names.
7. Discard candidates without a credible person name.
8. Deduplicate only high-confidence name and company matches within the conference.

The Firecrawl key remains server-side. The original public-URL validation runs before either network path, and Firecrawl receives only the validated public URL. Direct fetching remains first to minimize external credits. A successful rendered fallback is persisted as `sourceMode: firecrawl` and displayed as **LIVE · FIRECRAWL**. Firecrawl does not invent speaker data and cannot make a page useful when the source contains no speaker or agenda records.

Ambiguous candidates remain separate. Precision is more important than aggressive merging.

The database update is atomic. A failed ingestion never deletes or partially overwrites a previous successful conference. When live ingestion fails or yields no useful candidates, the UI explains the reason and offers the bundled sample; accepting it creates a conference marked `sourceMode: demo`.

## ICP Scoring

Scoring is deterministic, explainable, and capped at 100. Each awarded rule produces a visible reason and matched evidence. Missing or ambiguous information earns no points.

Initial rule groups and maximum contributions are:

- Seniority, 25 points: VP, head, director, chief, or equivalent leadership role.
- Function, 20 points: engineering, project delivery, development, construction, or infrastructure.
- Company, 25 points: owner-operator, developer, utility, power producer, or energy infrastructure operator.
- Topic, 20 points: data centers, power generation, behind-the-meter power, gas-to-power, interconnection, reliability, or grid infrastructure.
- Specificity, 10 points: named assets, capacities, geographies, timelines, or active project language.

Each group can award its contribution at most once, even when several keywords match. The rule implementation stores the group, points, human-readable reason, and matched source text for every award.

Thresholds:

- `80–100`: high priority
- `60–79`: qualified
- `0–59`: monitor

The Why Now summary combines score evidence with the number of days until the event and recommends a concrete next action. It does not introduce facts that were not extracted from the source data.

## Outreach Sequence

Every qualified speaker receives five steps anchored to the conference start date:

- T-14 days: relevant first touch.
- T-7 days: concise follow-up.
- T-2 days: meet-at-event request.
- Event day: in-person reminder.
- T+2 days: post-event conversation follow-up.

Drafts use only the speaker's name, role, company, session, event, and score evidence. An optional LLM adapter can improve phrasing, but deterministic templates remain the default fallback. All email drafts include an easy opt-out line. The system never sends them.

## Funnel Behavior

Creating a speaker records `identified`. A score of 60 or greater records `qualified`. Later stages are advanced manually in the prototype so the demonstration can show realistic conversion data without external email integrations.

For each stage, the funnel reports:

- Current count.
- Conversion from the previous stage.
- Absolute and percentage drop-off.

The application exposes one forward action at a time, advancing a speaker to the next ordered stage. It does not permit backward or skipped transitions. The bundled demo seed includes different speakers already positioned at different valid stages so every funnel segment is visible.

## Error Handling and Transparency

- Invalid URL: reject before any fetch and explain the accepted URL formats.
- Private or loopback URL: reject to prevent server-side request forgery.
- Timeout or blocked site: try the configured Firecrawl fallback, then preserve existing data and offer the labeled demo dataset if it also fails.
- Unsupported markup: report that no credible speaker records were found.
- Partial candidate: retain only when a credible name exists; missing fields earn no speculative score.
- LLM unavailable: use deterministic outreach templates without degrading the core flow.
- Persistence failure: roll back the ingestion and return an actionable error.

Every conference visibly identifies its source mode and last ingestion time.

## Testing Strategy

Unit and integration tests cover:

- JSON-LD, speaker-card, and agenda extraction using local HTML fixtures.
- Invalid candidates and missing fields.
- Name/company normalization and conservative deduplication.
- Each scoring rule, thresholds, and the 100-point cap.
- Conference-relative dates across month and year boundaries.
- Grounded deterministic drafts.
- Ordered funnel transitions, conversion, and drop-off calculations.
- Invalid, private, blocked, timed-out, and unsupported URLs.
- Atomic persistence behavior.

A browser test covers the demo-critical journey: load overview, ingest a fixture-backed conference, review ranked speakers, open the top speaker, inspect the sequence, and open the funnel.

## Acceptance Criteria

- A valid supported conference page produces structured speaker records.
- A failed live ingestion offers a clearly labeled, working demo fallback.
- Ranked speakers display a numeric score and the exact reasons for awarded points.
- The top speaker page displays a grounded Why Now summary and recommended action.
- Five outreach steps are scheduled relative to the conference start date.
- Funnel counts, conversions, and drop-offs render for all eight stages.
- No outreach is sent.
- The complete demo works without an LLM API key.
- Automated tests cover the core parser, scoring, sequencing, and funnel behavior.
- The interface is responsive and retains the approved Signal Room visual direction.

## Future Work

With another week, add recurring conference discovery, browser-based extraction for JavaScript-heavy sites, source-level evidence links, company/project enrichment, authentication, scheduled refresh jobs, and optional compliant email-provider integration.
