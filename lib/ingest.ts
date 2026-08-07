import type { ConferenceGraph, FunnelEvent, Speaker } from "@/lib/domain";
import { FUNNEL_STAGES } from "@/lib/domain";
import { fetchFirecrawlHtml as scrapeWithFirecrawl } from "@/lib/firecrawl";
import { deduplicateSpeakers } from "@/lib/normalize";
import { extractConference } from "@/lib/parser";
import { scoreSpeaker } from "@/lib/scoring";
import { buildSequence } from "@/lib/sequence";
import { assertPublicHttpUrl } from "@/lib/url-safety";

export type IngestionErrorCode =
  | "INVALID_URL"
  | "FETCH_FAILED"
  | "UNSUPPORTED_MARKUP"
  | "MISSING_EVENT_DATE";

export type IngestionResult =
  | ({ success: true } & ConferenceGraph)
  | {
      success: false;
      fallbackAvailable: true;
      errorCode: IngestionErrorCode;
      message: string;
    };

export interface IngestionDependencies {
  validateUrl?: (rawUrl: string) => Promise<URL>;
  fetchHtml?: (url: URL) => Promise<string>;
  fetchFirecrawlHtml?: (url: URL) => Promise<string>;
  now?: () => Date;
}

function stableId(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
}

export async function fetchPublicHtml(initialUrl: URL): Promise<string> {
  let current = initialUrl;

  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
      headers: { "user-agent": "SpeakerSignal/0.1 (+public-conference-research)" },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new Error("Conference site redirected unexpectedly");
      current = await assertPublicHttpUrl(new URL(location, current).toString());
      continue;
    }

    if (!response.ok) throw new Error(`Conference site returned ${response.status}`);
    return response.text();
  }

  throw new Error("Conference site exceeded redirect limit");
}

function failure(errorCode: IngestionErrorCode, message: string): IngestionResult {
  return { success: false, fallbackAvailable: true, errorCode, message };
}

export async function ingestConference(
  input: { url: string },
  dependencies: IngestionDependencies = {},
): Promise<IngestionResult> {
  const validateUrl = dependencies.validateUrl ?? assertPublicHttpUrl;
  const fetchHtml = dependencies.fetchHtml ?? fetchPublicHtml;
  const firecrawlApiKey = process.env.FIRECRAWL_API_KEY?.trim();
  const fetchFirecrawlHtml =
    dependencies.fetchFirecrawlHtml ??
    (firecrawlApiKey
      ? (url: URL) => scrapeWithFirecrawl(url, { apiKey: firecrawlApiKey })
      : undefined);
  const now = dependencies.now ?? (() => new Date());

  let url: URL;
  try {
    url = await validateUrl(input.url);
  } catch {
    return failure("INVALID_URL", "Enter a public HTTP(S) conference URL.");
  }

  let html: string;
  let sourceMode: "live" | "firecrawl" = "live";
  try {
    html = await fetchHtml(url);
  } catch {
    if (!fetchFirecrawlHtml) {
      return failure(
        "FETCH_FAILED",
        "The conference site blocked or timed out. You can load the labeled demo conference instead.",
      );
    }
    try {
      html = await fetchFirecrawlHtml(url);
      sourceMode = "firecrawl";
    } catch {
      return failure(
        "FETCH_FAILED",
        "The direct request failed and the Firecrawl fallback failed. Check the Firecrawl API key and available credits, or load the labeled demo conference.",
      );
    }
  }

  let extracted = extractConference(html, url.toString());
  let candidates = deduplicateSpeakers(extracted.speakers);
  if (candidates.length === 0 && sourceMode === "live" && fetchFirecrawlHtml) {
    try {
      html = await fetchFirecrawlHtml(url);
      sourceMode = "firecrawl";
      extracted = extractConference(html, url.toString());
      candidates = deduplicateSpeakers(extracted.speakers);
    } catch {
      // Preserve the specific unsupported-markup response below.
    }
  }
  if (candidates.length === 0) {
    return failure(
      "UNSUPPORTED_MARKUP",
      "No credible speaker records were found on this page. You can load the labeled demo conference instead.",
    );
  }
  if (!extracted.conference.startsAt || Number.isNaN(new Date(extracted.conference.startsAt).getTime())) {
    return failure(
      "MISSING_EVENT_DATE",
      "The agenda did not expose a usable conference date. You can load the labeled demo conference instead.",
    );
  }

  const conferenceId = stableId(`${extracted.conference.name}-${extracted.conference.startsAt}`);
  const conference = {
    ...extracted.conference,
    id: conferenceId,
    sourceMode,
    ingestionStatus: "complete" as const,
    lastIngestedAt: now().toISOString(),
  };

  const speakers: Speaker[] = candidates
    .map((candidate, index) => {
      const base: Speaker = {
        ...candidate,
        id: `${conferenceId}:${stableId(candidate.dedupeKey || String(index))}`,
        conferenceId,
        score: 0,
        scoreReasons: [],
      };
      const scored = scoreSpeaker(base);
      return { ...base, score: scored.score, scoreReasons: scored.reasons };
    })
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));

  const sequences = speakers
    .filter((speaker) => speaker.score >= 60)
    .flatMap((speaker) => buildSequence(speaker, conference));
  const funnelEvents: FunnelEvent[] = speakers.flatMap((speaker) => {
    const events: FunnelEvent[] = [
      {
        id: `${speaker.id}:identified`,
        speakerId: speaker.id,
        stage: FUNNEL_STAGES[0],
        occurredAt: conference.lastIngestedAt,
      },
    ];
    if (speaker.score >= 60) {
      events.push({
        id: `${speaker.id}:qualified`,
        speakerId: speaker.id,
        stage: FUNNEL_STAGES[1],
        occurredAt: conference.lastIngestedAt,
      });
    }
    return events;
  });

  return { success: true, conference, speakers, sequences, funnelEvents };
}
