import { load } from "cheerio";
import {
  RESEARCH_TASK_OUTPUT_INSTRUCTIONS,
  type ConferenceIntelligenceGraph,
  type ConferenceSession,
  type ResearchTask,
  type SessionSpeaker,
} from "@/lib/conference-intelligence";
import { FUNNEL_STAGES, type Conference, type FunnelEvent, type Speaker } from "@/lib/domain";
import { normalizeSpeaker } from "@/lib/normalize";
import { scoreSpeaker } from "@/lib/scoring";
import { buildSequence } from "@/lib/sequence";
import {
  assertCompleteConferenceGraph,
  fetchPublicConferenceText,
  slugify,
  type ConferenceAdapterDependencies,
} from "@/lib/adapters/shared";

const ROOT_URL = "https://www.gastechevent.com/";
const AGENDA_URLS = [
  "https://www.gastechevent.com/conferences/agenda-2026/?type=Strategic-Conference",
  "https://www.gastechevent.com/conferences/agenda-2026/?type=Technical-Conference",
  "https://www.gastechevent.com/conferences/agenda-2026/?type=Features-Conference",
];

export interface GastechDependencies extends ConferenceAdapterDependencies {
  rootUrl?: string;
  agendaUrls?: string[];
}

function fail(message: string): never {
  throw new Error(`Gastech invariant violated: ${message}`);
}

function bangkokIso(date: string, time: string): string {
  const parsed = new Date(`${date}T${time}:00+07:00`);
  if (!Number.isFinite(parsed.getTime())) fail(`invalid Bangkok timestamp ${date} ${time}`);
  return parsed.toISOString();
}

interface DirectSpeakerRecord {
  sourceId: string;
  name: string;
  title: string;
  company: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  profileUrl: string;
  sessionTitle: string;
  dedupeKey: string;
}

interface PendingSessionSpeaker {
  sessionId: string;
  speakerKey: string;
  role: string;
  evidenceUrl: string;
}

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function directHttpUrl(value: string | null | undefined, baseUrl: string): string {
  const candidate = cleanText(value);
  if (!candidate) return "";
  try {
    const url = new URL(candidate, baseUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function directLinkValue(href: string | null | undefined, protocol: "mailto:" | "tel:"): string {
  const candidate = cleanText(href);
  if (!candidate.toLowerCase().startsWith(protocol)) return "";
  return cleanText(candidate.slice(protocol.length).split("?")[0]);
}

function preferObserved(current: string, candidate: string): string {
  return current || candidate;
}

function mergeSpeakerRecord(
  existing: DirectSpeakerRecord,
  candidate: DirectSpeakerRecord,
): DirectSpeakerRecord {
  if (existing.name !== candidate.name) {
    fail(`speaker source id maps to conflicting names ${existing.name} and ${candidate.name}`);
  }
  const merged = normalizeSpeaker({
    name: existing.name,
    title: preferObserved(existing.title, candidate.title),
    company: preferObserved(existing.company, candidate.company),
    email: preferObserved(existing.email, candidate.email),
    phone: preferObserved(existing.phone, candidate.phone),
    linkedinUrl: preferObserved(existing.linkedinUrl, candidate.linkedinUrl),
    profileUrl: preferObserved(existing.profileUrl, candidate.profileUrl),
    sessionTitle: existing.sessionTitle,
  });
  return { sourceId: existing.sourceId || candidate.sourceId, ...merged };
}

export async function fetchGastechConference(
  dependencies: GastechDependencies = {},
): Promise<ConferenceIntelligenceGraph> {
  const fetchText =
    dependencies.fetchText ?? ((url) => fetchPublicConferenceText("Gastech", url));
  const rootUrl = dependencies.rootUrl ?? ROOT_URL;
  const agendaUrls = dependencies.agendaUrls ?? AGENDA_URLS;
  const [rootHtml, ...agendaPages] = await Promise.all([
    fetchText(rootUrl),
    ...agendaUrls.map(fetchText),
  ]);
  const rootText = load(rootHtml)("body").text().replace(/\s+/g, " ");
  if (!/14\s*-\s*17 September 2026/i.test(rootText)) {
    fail("official 2026 dates are absent");
  }

  const bySourceId = new Map<string, ConferenceSession>();
  const speakerRecords = new Map<string, DirectSpeakerRecord>();
  const speakerKeyBySourceId = new Map<string, string>();
  const speakerKeyByDedupe = new Map<string, string>();
  const pendingSessionSpeakers: PendingSessionSpeaker[] = [];

  for (let pageIndex = 0; pageIndex < agendaPages.length; pageIndex += 1) {
    const $ = load(agendaPages[pageIndex]);
    const pageUrl = agendaUrls[pageIndex];
    $(
      "[data-start-date][data-end-date], article[data-session-id], .m-seminar-list__list__content__row__items__item--session",
    ).each((_index, element) => {
      const node = $(element);
      const link = node.find("a[href*='agenda'], a[href*='session']").first();
      const href = link.attr("href") ?? "";
      const title =
        cleanText(link.text()) || cleanText(node.find("h2,h3,h4").first().text());
      const sourceId =
        node.attr("data-session-id") ||
        slugify(
          new URL(href || pageUrl, pageUrl).pathname.split("/").filter(Boolean).at(-1) ??
            title,
        );
      if (!sourceId || !title) return;
      const date =
        node.attr("data-date") ?? node.attr("data-start-date")?.slice(0, 10) ?? "";
      const start =
        node.attr("data-start-time") ?? node.attr("data-start-date")?.slice(11, 16) ?? "";
      const end =
        node.attr("data-end-time") ?? node.attr("data-end-date")?.slice(11, 16) ?? "";
      if (
        !/^2026-09-\d{2}$/.test(date) ||
        !/^\d{2}:\d{2}$/.test(start) ||
        !/^\d{2}:\d{2}$/.test(end)
      ) {
        return;
      }
      const sourceUrl = new URL(href || pageUrl, pageUrl).toString();
      const sessionId = `gastech-2026:session:${sourceId}`;
      const candidate: ConferenceSession = {
        id: sessionId,
        conferenceId: "gastech-2026",
        sourceId,
        sourceUrl,
        title,
        description: cleanText(node.find(".description,.summary,p").first().text()),
        startsAt: bangkokIso(date, start),
        endsAt: bangkokIso(date, end),
        location: cleanText(node.find(".location,[data-location]").first().text()),
        track: new URL(pageUrl).searchParams.get("type") ?? "",
        sessionType: node.attr("data-session-type") ?? "Session",
      };
      const existingSession = bySourceId.get(sourceId);
      if (existingSession && JSON.stringify(existingSession) !== JSON.stringify(candidate)) {
        fail(`conflicting duplicate session ${sourceId}`);
      }
      bySourceId.set(sourceId, candidate);

      node
        .find(
          "[data-speaker-id], [data-speaker-name], [itemtype$='/Person'], .agenda-multi-speaker-col, .session-speaker",
        )
        .each((_speakerIndex, speakerElement) => {
          const speakerNode = $(speakerElement);
          const contentNode = speakerNode.find(".agenda-multi-speaker-content").first();
          const name =
            cleanText(speakerNode.attr("data-speaker-name")) ||
            cleanText(
              speakerNode
                .find("[data-speaker-name], [itemprop='name'], .speaker-name, h5, h6")
                .first()
                .text(),
            );
          if (!name) return;

          const company =
            cleanText(speakerNode.attr("data-company")) ||
            cleanText(
              speakerNode
                .find(
                  "[data-company], [itemprop='worksFor'] [itemprop='name'], .speaker-company, .company",
                )
                .first()
                .text(),
            ) ||
            cleanText(contentNode.find("strong").first().text());
          const observedRole =
            cleanText(speakerNode.attr("data-speaker-role")) ||
            cleanText(speakerNode.find(".speaker-role, [data-speaker-role]").first().text());
          const directContentSpans = contentNode
            .children("span")
            .toArray()
            .map((span) => cleanText($(span).text()))
            .filter((value) => value && value !== company && !/^moderator$/i.test(value));
          const titleText =
            cleanText(speakerNode.attr("data-job-title")) ||
            cleanText(speakerNode.attr("data-speaker-title")) ||
            cleanText(
              speakerNode
                .find("[data-job-title], [itemprop='jobTitle'], .job-title, .speaker-title")
                .first()
                .text(),
            ) ||
            directContentSpans[0] ||
            "";
          const moderator =
            /^(?:true|1)$/i.test(cleanText(speakerNode.attr("data-is-moderator"))) ||
            contentNode
              .children("span")
              .toArray()
              .some((span) => /^moderator$/i.test(cleanText($(span).text())));
          const emailLink = speakerNode.find("a[href^='mailto:']").first().attr("href");
          const phoneLink = speakerNode.find("a[href^='tel:']").first().attr("href");
          const linkedinLink = speakerNode
            .find("a[href*='linkedin.com/']")
            .first()
            .attr("href");
          const profileLink = speakerNode
            .find(
              "a[data-speaker-profile][href], a[href*='/speaker/'], a[href*='/speakers/'], a[href*='/profile/']",
            )
            .first()
            .attr("href");
          const normalized = normalizeSpeaker({
            name,
            title: titleText,
            company,
            email:
              cleanText(speakerNode.attr("data-email")) ||
              directLinkValue(emailLink, "mailto:") ||
              cleanText(
                speakerNode.find("[itemprop='email']").first().attr("content") ??
                  speakerNode.find("[itemprop='email']").first().text(),
              ),
            phone:
              cleanText(
                speakerNode.attr("data-phone") ?? speakerNode.attr("data-mobile"),
              ) ||
              directLinkValue(phoneLink, "tel:") ||
              cleanText(
                speakerNode.find("[itemprop='telephone']").first().attr("content") ??
                  speakerNode.find("[itemprop='telephone']").first().text(),
              ),
            linkedinUrl: directHttpUrl(
              speakerNode.attr("data-linkedin-url") ??
                speakerNode.attr("data-linkedin") ??
                linkedinLink,
              sourceUrl,
            ),
            profileUrl: directHttpUrl(
              speakerNode.attr("data-profile-url") ?? profileLink,
              sourceUrl,
            ),
            sessionTitle: title,
          });
          const observedSourceId = cleanText(
            speakerNode.attr("data-speaker-id") ??
              speakerNode.attr("data-user-id") ??
              speakerNode.attr("data-id"),
          );
          const sourceIdentity = slugify(observedSourceId);
          const existingKey =
            (sourceIdentity && speakerKeyBySourceId.get(sourceIdentity)) ||
            speakerKeyByDedupe.get(normalized.dedupeKey);
          const speakerKey =
            existingKey ||
            (sourceIdentity
              ? `source:${sourceIdentity}`
              : `dedupe:${normalized.dedupeKey}:${speakerRecords.size}`);
          const record: DirectSpeakerRecord = {
            sourceId: sourceIdentity,
            ...normalized,
          };
          const existingSpeaker = speakerRecords.get(speakerKey);
          speakerRecords.set(
            speakerKey,
            existingSpeaker ? mergeSpeakerRecord(existingSpeaker, record) : record,
          );
          if (sourceIdentity) speakerKeyBySourceId.set(sourceIdentity, speakerKey);
          speakerKeyByDedupe.set(normalized.dedupeKey, speakerKey);
          speakerKeyByDedupe.set(speakerRecords.get(speakerKey)!.dedupeKey, speakerKey);
          pendingSessionSpeakers.push({
            sessionId,
            speakerKey,
            role: observedRole || (moderator ? "Moderator" : "Speaker"),
            evidenceUrl: sourceUrl,
          });
        });
    });
  }

  const sessions = [...bySourceId.values()].sort(
    (a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id),
  );
  if (sessions.length === 0) {
    fail(
      "official agenda advertises 200 sessions but exposes no enumerable session records; refusing partial ingestion",
    );
  }

  const now = (dependencies.now ?? (() => new Date()))().toISOString();
  const conference: Conference = {
    id: "gastech-2026",
    name: "Gastech 2026",
    sourceUrl: rootUrl,
    location: "BITEC, Bangkok, Thailand",
    startsAt: "2026-09-14T00:00:00.000Z",
    endsAt: "2026-09-17T16:59:59.999Z",
    sourceMode: "live",
    ingestionStatus: "complete",
    lastIngestedAt: now,
  };
  const speakersByKey = new Map<string, Speaker>();
  const usedSpeakerIds = new Set<string>();
  for (const [speakerKey, record] of speakerRecords) {
    const fallbackId = `${slugify(record.name)}:${slugify(record.company || "unknown")}`;
    const speakerId = `gastech-2026:speaker:${record.sourceId || fallbackId}`;
    if (usedSpeakerIds.has(speakerId)) fail(`duplicate generated speaker id ${speakerId}`);
    usedSpeakerIds.add(speakerId);
    speakersByKey.set(speakerKey, {
      id: speakerId,
      conferenceId: conference.id,
      name: record.name,
      title: record.title,
      company: record.company,
      email: record.email,
      phone: record.phone,
      linkedinUrl: record.linkedinUrl,
      profileUrl: record.profileUrl,
      sessionTitle: record.sessionTitle,
      score: 0,
      scoreReasons: [],
      dedupeKey: record.dedupeKey,
    });
  }
  const speakers = [...speakersByKey.values()]
    .map((speaker) => {
      const scored = scoreSpeaker(speaker);
      return { ...speaker, score: scored.score, scoreReasons: scored.reasons };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
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
  const sessionSpeakersByKey = new Map<string, SessionSpeaker>();
  for (const pending of pendingSessionSpeakers) {
    const speaker = speakersByKey.get(pending.speakerKey);
    if (!speaker) fail(`session relation references missing speaker ${pending.speakerKey}`);
    const relationKey = `${pending.sessionId}::${speaker.id}`;
    if (!sessionSpeakersByKey.has(relationKey)) {
      sessionSpeakersByKey.set(relationKey, {
        sessionId: pending.sessionId,
        speakerId: speaker.id,
        role: pending.role,
        evidenceUrl: pending.evidenceUrl,
      });
    }
  }
  const researchTasks: ResearchTask[] = sessions
    .filter((session) => !/registration|reception|break|lunch|networking/i.test(session.title))
    .map((session) => ({
      id: `task:gastech-2026:${session.sourceId}`,
      conferenceId: conference.id,
      sessionId: session.id,
      targetUrl: session.sourceUrl,
      title: `Research ${session.title}`,
      status: "pending",
      priority: 80,
      instructions: `Investigate speaker claims, power projects, capacity, markets, timelines, and counterparties for session "${session.title}". Include exact evidence URLs. Do not infer missing details. ${RESEARCH_TASK_OUTPUT_INSTRUCTIONS}`,
      claimedBy: null,
      claimedAt: null,
      completedAt: null,
      output: null,
    }));
  return assertCompleteConferenceGraph("Gastech", {
    conference,
    speakers,
    sequences,
    funnelEvents,
    sessions,
    sessionSpeakers: [...sessionSpeakersByKey.values()],
    researchTasks,
    coverage: {
      expectedSessionPages: agendaPages.length,
      fetchedSessionPages: agendaPages.length,
      expectedSessions: sessions.length,
      extractedSessions: sessions.length,
      expectedSpeakerPages: 0,
      fetchedSpeakerPages: 0,
      expectedIndexedSpeakers: 0,
      extractedIndexedSpeakers: 0,
      structuredAgendaSpeakers: speakers.length,
      expectedDescriptionOnlySpeakers: 0,
      descriptionOnlySpeakers: 0,
      expectedTotalSpeakers: speakers.length,
      totalSpeakers: speakers.length,
      expectedResearchTasks: researchTasks.length,
      extractedResearchTasks: researchTasks.length,
    },
  });
}
