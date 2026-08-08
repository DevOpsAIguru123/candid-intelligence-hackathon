import { load } from "cheerio";

import { RESEARCH_TASK_OUTPUT_INSTRUCTIONS } from "@/lib/conference-intelligence";
import type {
  ConferenceIntelligenceGraph,
  ConferenceSession,
  IngestionCoverage,
  ResearchTask,
  SessionSpeaker,
} from "@/lib/conference-intelligence";
import type { Conference, FunnelEvent, Speaker } from "@/lib/domain";
import { FUNNEL_STAGES } from "@/lib/domain";
import { normalizeSpeaker } from "@/lib/normalize";
import { scoreSpeaker } from "@/lib/scoring";
import { buildSequence } from "@/lib/sequence";
import { assertPublicHttpUrl } from "@/lib/url-safety";

export interface DtechDependencies {
  fetchText?: (url: string) => Promise<string>;
  now?: () => Date;
  rootUrl?: string;
  agendaUrl?: string;
}

const DEFAULT_ROOT_URL =
  "https://web.archive.org/web/20260316080945id_/https://dtech-events.com/data-ai";
const DEFAULT_AGENDA_URL =
  "https://web.archive.org/web/20260413134129id_/https://dtech-events.com/data-ai/event-info/event-agenda";
const CANONICAL_SOURCE_URL = "https://dtech-events.com/data-ai";
const SCOTTSDALE_OFFSET = "-07:00";

const DATE_WRAPPER_SELECTOR = ".m-seminar-list__list__content__wrapper[id]";
const ROW_SELECTOR = ".m-seminar-list__list__content__row";
const ROW_TIME_SELECTOR = ".m-seminar-list__list__content__row__header";
const SESSION_SELECTOR =
  "li.m-seminar-list__list__content__row__items__item--session";
const TITLE_SELECTOR = ".m-seminar-list__list__content__row__items__item__title a";
const LOCATION_SELECTOR =
  ".m-seminar-list__list__content__row__items__item__meta__location";
const DURATION_SELECTOR =
  ".m-seminar-list__list__content__row__items__item__meta__time";
const DESCRIPTION_SELECTOR =
  ".m-seminar-list__list__content__row__items__item__description";
const SPEAKER_GROUP_SELECTOR =
  ".m-seminar-list__list__content__row__items__item__speakers";
const SPEAKER_ROLE_SELECTOR =
  ".m-seminar-list__list__content__row__items__item__speakers__title";
const SPEAKER_NAME_LINK_SELECTOR =
  ".m-seminar-list__list__content__row__items__item__speakers__speaker__name a";

const MONTH_BY_NAME: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

interface ParsedSpeaker {
  pathSlug: string;
  name: string;
  title: string;
  company: string;
  role: "Speaker" | "Moderator";
}

interface ParsedSession {
  sourceId: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  location: string;
  sessionType: "Keynote" | "Workshop" | "Roundtable" | "Logistics" | "Session";
  speakers: ParsedSpeaker[];
}

function invariant(message: string): never {
  throw new Error(`DTECH invariant violated: ${message}`);
}

function collapseWhitespace(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function fetchPublicText(urlStr: string): Promise<string> {
  const verifiedUrl = await assertPublicHttpUrl(urlStr);
  const response = await fetch(verifiedUrl.toString(), {
    signal: AbortSignal.timeout(10_000),
    headers: {
      "user-agent": "SpeakerSignal/0.1 (+public-conference-research)",
    },
  });
  if (!response.ok) {
    throw new Error(
      `DTECH fetch failed for ${urlStr}: ${response.status} ${response.statusText}`,
    );
  }
  return response.text();
}

function parseDateId(rawId: string): string {
  const match = rawId.trim().toLowerCase().match(/^(\d{1,2})-([a-z]+)-(\d{4})$/);
  if (!match) {
    return invariant(`malformed schedule date wrapper id "${rawId}"`);
  }

  const day = Number(match[1]);
  const month = MONTH_BY_NAME[match[2]];
  const year = Number(match[3]);
  if (!month || year !== 2026) {
    return invariant(`schedule date wrapper "${rawId}" is outside the fixed 2026 edition`);
  }

  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    day < 1 ||
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return invariant(`schedule date wrapper "${rawId}" contains an invalid date`);
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseLocalTime(rawTime: string, context: string): { hour: number; minute: number } {
  const match = collapseWhitespace(rawTime).match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!match) {
    return invariant(`missing or invalid start time for ${context}`);
  }

  const hour12 = Number(match[1]);
  const minute = Number(match[2]);
  if (hour12 < 1 || hour12 > 12 || minute < 0 || minute > 59) {
    return invariant(`missing or invalid start time for ${context}`);
  }

  const isPm = match[3].toUpperCase() === "PM";
  return { hour: (hour12 % 12) + (isPm ? 12 : 0), minute };
}

function parseDurationMinutes(rawDuration: string, context: string): number {
  const match = collapseWhitespace(rawDuration).match(/^(\d+)\s*(?:mins?|minutes?)$/i);
  const duration = match ? Number(match[1]) : 0;
  if (!Number.isSafeInteger(duration) || duration <= 0) {
    return invariant(`missing or invalid duration for ${context}`);
  }
  return duration;
}

function formatLocalTimestamp(date: string, hour: number, minute: number): string {
  const timestamp = new Date(
    `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00${SCOTTSDALE_OFFSET}`,
  );
  if (Number.isNaN(timestamp.getTime())) {
    return invariant(`could not construct timestamp for ${date} ${hour}:${minute}`);
  }
  return timestamp.toISOString();
}

function addLocalMinutes(date: string, hour: number, minute: number, duration: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const localClock = new Date(Date.UTC(year, month - 1, day, hour, minute + duration));
  const endDate = [
    localClock.getUTCFullYear(),
    String(localClock.getUTCMonth() + 1).padStart(2, "0"),
    String(localClock.getUTCDate()).padStart(2, "0"),
  ].join("-");
  return formatLocalTimestamp(endDate, localClock.getUTCHours(), localClock.getUTCMinutes());
}

function pathSlug(rawHref: string, kind: "session" | "speaker"): string {
  let pathname: string;
  try {
    pathname = new URL(rawHref, CANONICAL_SOURCE_URL + "/").pathname;
  } catch {
    return invariant(`malformed structured ${kind} link "${rawHref}"`);
  }

  const components = pathname.split("/").filter(Boolean);
  const expectedParent = kind === "speaker" ? "speakers" : "event-schedule-2026";
  const parentIndex = components.lastIndexOf(expectedParent);
  const encodedSlugParts = components.slice(parentIndex + 1);
  if (
    parentIndex < 0 ||
    encodedSlugParts.length === 0 ||
    (kind === "speaker" && encodedSlugParts.length !== 1)
  ) {
    return invariant(`malformed structured ${kind} link "${rawHref}"`);
  }

  let decodedSlugParts: string[];
  try {
    decodedSlugParts = encodedSlugParts.map((part) => decodeURIComponent(part));
  } catch {
    return invariant(`malformed structured ${kind} link "${rawHref}"`);
  }
  if (decodedSlugParts.some((part) => !part || part.includes("/") || part.includes("\\"))) {
    return invariant(`malformed structured ${kind} link "${rawHref}"`);
  }

  const slug = slugify(decodedSlugParts.join("-"));
  if (!slug) {
    return invariant(`malformed structured ${kind} link "${rawHref}"`);
  }
  return slug;
}

function parseSpeakerText(
  rawText: string,
  href: string,
  role: "Speaker" | "Moderator",
): ParsedSpeaker {
  const text = collapseWhitespace(rawText);
  const companySeparator = text.lastIndexOf(" - ");
  if (companySeparator <= 0 || companySeparator >= text.length - 3) {
    return invariant(`malformed structured speaker link "${href}": expected name/title and company`);
  }

  const identity = text.slice(0, companySeparator).trim();
  const company = text.slice(companySeparator + 3).trim();
  if (!identity || !company) {
    return invariant(`malformed structured speaker link "${href}": empty identity or company`);
  }

  const identityParts = identity.split(",").map((part) => part.trim());
  let name = identityParts.shift() ?? "";
  if (identityParts.length > 0 && /^(?:ph\.?d\.?|m\.?d\.?|p\.?e\.?)$/i.test(identityParts[0])) {
    name = `${name}, ${identityParts.shift()}`;
  }
  const title = identityParts.join(", ");
  if (!name) {
    return invariant(`malformed structured speaker link "${href}": empty speaker name`);
  }

  return {
    pathSlug: pathSlug(href, "speaker"),
    name,
    title,
    company,
    role,
  };
}

function classifySession(title: string): ParsedSession["sessionType"] {
  if (/keynote/i.test(title) || /^insights by\b/i.test(title)) return "Keynote";
  if (/\b(?:workshop|challenge lab)\b/i.test(title)) return "Workshop";
  if (/\broundtable\b/i.test(title)) return "Roundtable";
  if (/\b(?:registration|breakfast|lunch|reception|networking)\b/i.test(title)) {
    return "Logistics";
  }
  return "Session";
}

function priorityFor(sessionType: ParsedSession["sessionType"]): number {
  switch (sessionType) {
    case "Keynote":
      return 100;
    case "Workshop":
      return 90;
    case "Roundtable":
      return 85;
    case "Session":
      return 80;
    case "Logistics":
      return invariant("attempted to create a research task for a logistics session");
  }
}

function assertUniqueIds(values: Array<{ id: string }>, label: string): void {
  const ids = new Set<string>();
  for (const value of values) {
    if (ids.has(value.id)) invariant(`duplicate ${label} id "${value.id}"`);
    ids.add(value.id);
  }
}

export async function fetchDtechConference(
  dependencies: DtechDependencies = {},
): Promise<ConferenceIntelligenceGraph> {
  const fetchText = dependencies.fetchText ?? fetchPublicText;
  const nowFn = dependencies.now ?? (() => new Date());
  const rootUrl = dependencies.rootUrl ?? DEFAULT_ROOT_URL;
  const agendaUrl = dependencies.agendaUrl ?? DEFAULT_AGENDA_URL;

  const rootHtml = await fetchText(rootUrl);
  const agendaHtml = await fetchText(agendaUrl);
  const $root = load(rootHtml);
  const $agenda = load(agendaHtml);

  const conferenceName =
    collapseWhitespace($root("meta[property='og:site_name']").first().attr("content")) ||
    collapseWhitespace($root("title").first().text());
  if (!conferenceName) invariant("conference name is absent from og:site_name and title");

  const locationElement = $root(".s-header__default__dates").first().clone();
  locationElement.find("br").replaceWith(" ");
  const location = collapseWhitespace(locationElement.text());
  if (!location) invariant("visible venue is absent from .s-header__default__dates");

  const scheduleWrapper = $agenda(".js-librarylistwrapper[data-totalcount]").first();
  if (scheduleWrapper.length !== 1) invariant("schedule wrapper is missing");
  const declaredCountText = scheduleWrapper.attr("data-totalcount") ?? "";
  if (!/^\d+$/.test(declaredCountText)) invariant("declared session count is invalid");
  const declaredCount = Number(declaredCountText);
  if (declaredCount === 0) invariant("declared session count must be greater than zero");

  const rawSessions: ParsedSession[] = [];
  const compoundIds = new Set<string>();
  const scheduleDates: string[] = [];

  scheduleWrapper.find(DATE_WRAPPER_SELECTOR).each((_dateIndex, dateElement) => {
    const dateWrapper = $agenda(dateElement);
    const date = parseDateId(dateWrapper.attr("id") ?? "");
    scheduleDates.push(date);

    dateWrapper.find(ROW_SELECTOR).each((_rowIndex, rowElement) => {
      const row = $agenda(rowElement);
      const items = row.find(SESSION_SELECTOR);
      if (items.length === 0) return;

      const rawStartTime = row.find(ROW_TIME_SELECTOR).first().text();
      items.each((_itemIndex, itemElement) => {
        const item = $agenda(itemElement);
        const titleLink = item.find(TITLE_SELECTOR).first();
        const title = collapseWhitespace(titleLink.text());
        const detailHref = titleLink.attr("href") ?? "";
        if (!title || !detailHref) invariant(`session on ${date} has a missing title link`);

        const detailSlug = pathSlug(detailHref, "session");
        const { hour, minute } = parseLocalTime(rawStartTime, `session "${title}"`);
        const durationMinutes = parseDurationMinutes(
          item.find(DURATION_SELECTOR).first().text(),
          `session "${title}"`,
        );
        const hhmm = `${String(hour).padStart(2, "0")}${String(minute).padStart(2, "0")}`;
        const sourceId = `${detailSlug}:${date}:${hhmm}`;
        if (compoundIds.has(sourceId)) invariant(`duplicate compound session id "${sourceId}"`);
        compoundIds.add(sourceId);

        const speakers: ParsedSpeaker[] = [];
        item.find(SPEAKER_GROUP_SELECTOR).each((_groupIndex, groupElement) => {
          const group = $agenda(groupElement);
          const rawRole = collapseWhitespace(group.find(SPEAKER_ROLE_SELECTOR).first().text());
          const role: ParsedSpeaker["role"] = /moderator/i.test(rawRole)
            ? "Moderator"
            : "Speaker";
          const explicitNameLinks = group.find(SPEAKER_NAME_LINK_SELECTOR);
          const links = explicitNameLinks.length > 0 ? explicitNameLinks : group.find("a");

          group
            .find(".m-seminar-list__list__content__row__items__item__speakers__speaker")
            .each((_speakerIndex, speakerElement) => {
              if ($agenda(speakerElement).find("a[href]").length !== 1) {
                invariant(`malformed structured speaker link in session "${title}"`);
              }
            });

          links.each((_linkIndex, linkElement) => {
            const link = $agenda(linkElement);
            const href = link.attr("href") ?? "";
            if (!href) invariant(`malformed structured speaker link in session "${title}"`);
            speakers.push(parseSpeakerText(link.text(), href, role));
          });
        });

        rawSessions.push({
          sourceId,
          title,
          description: collapseWhitespace(item.find(DESCRIPTION_SELECTOR).first().text()),
          startsAt: formatLocalTimestamp(date, hour, minute),
          endsAt: addLocalMinutes(date, hour, minute, durationMinutes),
          location: collapseWhitespace(item.find(LOCATION_SELECTOR).first().text()),
          sessionType: classifySession(title),
          speakers,
        });
      });
    });
  });

  if (scheduleDates.length === 0) invariant("schedule contains no dated wrappers");
  if (rawSessions.length !== declaredCount) {
    invariant(
      `declared session count ${declaredCount} does not match extracted session count ${rawSessions.length}`,
    );
  }

  const conferenceStartsAt = formatLocalTimestamp(scheduleDates[0], 0, 0);
  const conferenceEndsAt = rawSessions.reduce(
    (latest, session) => (session.endsAt > latest ? session.endsAt : latest),
    conferenceStartsAt,
  );
  const conferenceId = slugify(`${conferenceName}-${scheduleDates[0]}`);
  if (!conferenceId) invariant("conference id could not be derived");

  const lastIngestedAt = nowFn().toISOString();
  if (lastIngestedAt === "Invalid Date") invariant("now dependency returned an invalid date");

  const conference: Conference = {
    id: conferenceId,
    name: conferenceName,
    sourceUrl: CANONICAL_SOURCE_URL,
    location,
    startsAt: conferenceStartsAt,
    endsAt: conferenceEndsAt,
    sourceMode: "live",
    ingestionStatus: "complete",
    lastIngestedAt,
  };

  const sessions: ConferenceSession[] = rawSessions.map((session) => ({
    id: `${conferenceId}:session:${session.sourceId}`,
    conferenceId,
    sourceId: session.sourceId,
    sourceUrl: agendaUrl,
    title: session.title,
    description: session.description,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    location: session.location,
    track: "",
    sessionType: session.sessionType,
  }));

  const speakerByPath = new Map<string, Speaker>();
  const sessionSpeakers: SessionSpeaker[] = [];
  for (const rawSession of rawSessions) {
    const sessionId = `${conferenceId}:session:${rawSession.sourceId}`;
    for (const parsedSpeaker of rawSession.speakers) {
      let speaker = speakerByPath.get(parsedSpeaker.pathSlug);
      if (!speaker) {
        const normalized = normalizeSpeaker({
          name: parsedSpeaker.name,
          title: parsedSpeaker.title,
          company: parsedSpeaker.company,
          sessionTitle: rawSession.title,
        });
        speaker = {
          id: `${conferenceId}:speaker:${parsedSpeaker.pathSlug}`,
          conferenceId,
          name: normalized.name,
          title: normalized.title,
          company: normalized.company,
          sessionTitle: normalized.sessionTitle,
          score: 0,
          scoreReasons: [],
          dedupeKey: normalized.dedupeKey,
        };
        speakerByPath.set(parsedSpeaker.pathSlug, speaker);
      }

      sessionSpeakers.push({
        sessionId,
        speakerId: speaker.id,
        role: parsedSpeaker.role,
        evidenceUrl: agendaUrl,
      });
    }
  }

  const speakers = [...speakerByPath.values()]
    .map((speaker): Speaker => {
      const scored = scoreSpeaker(speaker);
      return { ...speaker, score: scored.score, scoreReasons: scored.reasons };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const researchTasks: ResearchTask[] = rawSessions.flatMap((session) => {
    if (session.sessionType === "Logistics") return [];
    const sessionId = `${conferenceId}:session:${session.sourceId}`;
    return [
      {
        id: `task:${conferenceId}:${session.sourceId}`,
        conferenceId,
        sessionId,
        targetUrl: agendaUrl,
        title: `Research ${session.title}`,
        status: "pending",
        priority: priorityFor(session.sessionType),
        instructions: `Investigate speaker claims, power projects, capacity figures (MW/GW/kV), geographic markets, deployment timelines, and counterparty relationships for session "${session.title}". Include exact evidence URLs. Do not infer missing details. ${RESEARCH_TASK_OUTPUT_INSTRUCTIONS}`,
        claimedBy: null,
        claimedAt: null,
        completedAt: null,
        output: null,
      },
    ];
  });

  const sequences = speakers
    .filter((speaker) => speaker.score >= 60)
    .flatMap((speaker) => buildSequence(speaker, conference));

  const funnelEvents: FunnelEvent[] = speakers.flatMap((speaker) => {
    const events: FunnelEvent[] = [
      {
        id: `${speaker.id}:identified`,
        speakerId: speaker.id,
        stage: FUNNEL_STAGES[0],
        occurredAt: lastIngestedAt,
      },
    ];
    if (speaker.score >= 60) {
      events.push({
        id: `${speaker.id}:qualified`,
        speakerId: speaker.id,
        stage: FUNNEL_STAGES[1],
        occurredAt: lastIngestedAt,
      });
    }
    return events;
  });

  const coverage: IngestionCoverage = {
    expectedSessionPages: 1,
    fetchedSessionPages: 1,
    expectedSessions: declaredCount,
    extractedSessions: sessions.length,
    expectedSpeakerPages: 0,
    fetchedSpeakerPages: 0,
    expectedIndexedSpeakers: 0,
    extractedIndexedSpeakers: 0,
    structuredAgendaSpeakers: speakerByPath.size,
    expectedDescriptionOnlySpeakers: 0,
    descriptionOnlySpeakers: 0,
    expectedTotalSpeakers: speakerByPath.size,
    totalSpeakers: speakerByPath.size,
    expectedResearchTasks: researchTasks.length,
    extractedResearchTasks: researchTasks.length,
  };

  assertUniqueIds(sessions, "session");
  assertUniqueIds(speakers, "speaker");
  assertUniqueIds(researchTasks, "research task");
  assertUniqueIds(sequences, "sequence");
  assertUniqueIds(funnelEvents, "funnel event");

  const sessionIds = new Set(sessions.map((session) => session.id));
  const speakerIds = new Set(speakers.map((speaker) => speaker.id));
  for (const relation of sessionSpeakers) {
    if (!sessionIds.has(relation.sessionId) || !speakerIds.has(relation.speakerId)) {
      invariant("session-speaker relation contains an unresolved graph reference");
    }
  }
  for (const task of researchTasks) {
    if (!sessionIds.has(task.sessionId)) {
      invariant(`research task "${task.id}" contains an unresolved session reference`);
    }
  }
  for (const sequence of sequences) {
    if (!speakerIds.has(sequence.speakerId)) {
      invariant(`sequence "${sequence.id}" contains an unresolved speaker reference`);
    }
  }
  for (const event of funnelEvents) {
    if (!speakerIds.has(event.speakerId)) {
      invariant(`funnel event "${event.id}" contains an unresolved speaker reference`);
    }
  }

  return {
    conference,
    speakers,
    sequences,
    funnelEvents,
    sessions,
    sessionSpeakers,
    researchTasks,
    coverage,
  };
}
