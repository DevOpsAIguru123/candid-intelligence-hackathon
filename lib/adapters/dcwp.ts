import { load } from "cheerio";
import { parse } from "csv-parse/sync";

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

export interface DcwpDependencies {
  fetchText?: (url: string) => Promise<string>;
  now?: () => Date;
}

const DEFAULT_ROOT_URL = "https://dcwpower.com/";

const CONTENT_SESSION_TYPES = new Set([
  "keynote",
  "session",
  "workshop",
  "solutions spotlight",
  "tech talk",
]);

const LOGISTICS_TITLE_PATTERNS = /\b(?:registration|breakfast|lunch|expo hall|reception|golf outing|hoedown)\b/i;

export async function defaultFetchText(urlStr: string): Promise<string> {
  const verifiedUrl = await assertPublicHttpUrl(urlStr);
  const response = await fetch(verifiedUrl.toString(), {
    signal: AbortSignal.timeout(10_000),
    headers: {
      "user-agent": "SpeakerSignal/0.1 (+public-conference-research)",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${urlStr}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cleanText(value: string | null | undefined): string {
  return collapseWhitespace(value ?? "");
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

export function extractWindowGlobal(html: string, globalName: string): string | null {
  const directRegex = new RegExp(`window\\.${globalName}\\s*=\\s*["']([^"']+)["']`);
  const directMatch = html.match(directRegex);
  if (directMatch) {
    return directMatch[1];
  }

  const varRefRegex = new RegExp(`window\\.${globalName}\\s*=\\s*([A-Za-z_$][A-Za-z0-9_$]*)\\s*;`);
  const varRefMatch = html.match(varRefRegex);
  if (varRefMatch) {
    const varName = varRefMatch[1];
    const assignRegex = new RegExp(`(?:var|let|const)\\s+${varName}\\s*=\\s*["']([^"']+)["']`);
    const assignMatch = html.match(assignRegex);
    if (assignMatch) {
      return assignMatch[1];
    }
  }

  return null;
}

function extractTzOffset(tzStr: string, defaultStartTimeStr: string): string {
  const match = defaultStartTimeStr.match(/([+-]\d{2}:?\d{2})$/);
  if (match) {
    const raw = match[1];
    return raw.includes(":") ? raw : `${raw.slice(0, 3)}:${raw.slice(3)}`;
  }
  const tzMatch = tzStr.match(/([+-]\d{2}:?\d{2})$/);
  if (tzMatch) {
    const raw = tzMatch[1];
    return raw.includes(":") ? raw : `${raw.slice(0, 3)}:${raw.slice(3)}`;
  }
  throw new Error("Could not extract timezone offset from schedule globals");
}

function parseTimestampWithOffset(rawStr: string, offset: string): string {
  const trimmed = rawStr.trim();
  if (!trimmed) return "";

  const wallClockMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?))?/);
  if (wallClockMatch) {
    const datePart = wallClockMatch[1];
    const timePart = wallClockMatch[2] || "00:00:00";
    const isoFormatted = `${datePart}T${timePart}${offset}`;
    const d = new Date(isoFormatted);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
  }

  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

interface RawSessionItem {
  sourceId: string;
  sourceUrl: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  track: string;
  sessionType: string;
  agendaSpeakers: Array<{
    speakerId: string;
    name: string;
    company: string;
    role: string;
  }>;
}

interface RawCsvSession {
  title: string;
  startTime: string;
  endTime: string;
  description: string;
  takeaway: string;
  location: string;
  tracks: string;
  format: string;
  speakersStr: string;
}

interface RawDirectorySpeaker {
  speakerId: string;
  name: string;
  title: string;
  company: string;
  sourceUrl: string;
  email: string;
  phone: string;
  linkedinUrl: string;
}

interface DescriptionSpeakerCandidate {
  name: string;
  title: string;
  company: string;
  identityKey: string;
  dedupeKey: string;
  sessionSourceId: string;
  sessionTitle: string;
  evidenceUrl: string;
}

function parseDescriptionSpeakerCandidates(
  descriptionText: string,
  session: RawSessionItem,
): DescriptionSpeakerCandidate[] {
  if (!/Speakers include:/i.test(descriptionText)) {
    return [];
  }

  const afterMarker = descriptionText.split(/Speakers include:/i)[1] ?? "";
  const lines = afterMarker
    .split(/\r?\n|•|<li[^>]*>|<\/li>/)
    .map((line) => line.replace(/<[^>]+>/g, "").trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error(`Description speaker inventory is empty for session ${session.sourceId}`);
  }

  const sponsorCompanyMatch = descriptionText.match(
    /\b([A-Z][A-Za-z0-9]+)\s+(?:brings|experts|sponsored)/,
  );
  const contextCompany = sponsorCompanyMatch?.[1] ?? "";

  return lines.map((rawLine) => {
    const cleanedLine = rawLine
      .replace(/^(?:Featured Keynote Speaker|Keynote Speaker|Speaker):\s*/i, "")
      .trim();
    const parts = cleanedLine.split(",").map((part) => part.trim());
    const name = parts[0] ?? "";

    if (name.length < 3 || parts.length < 2) {
      throw new Error(
        `Malformed description speaker entry for session ${session.sourceId}: ${cleanedLine}`,
      );
    }

    const rest = parts.slice(1).join(", ");
    const atCompanyMatch = rest.match(/(.*?)\s+(?:at|of)\s+(.*)/i);
    const title = atCompanyMatch ? atCompanyMatch[1].trim() : rest;
    const company = atCompanyMatch ? atCompanyMatch[2].trim() : contextCompany;
    const normalized = normalizeSpeaker({
      name,
      title,
      company,
      sessionTitle: session.title,
    });
    const identityKey = slugify(normalized.name);

    if (!identityKey) {
      throw new Error(`Description speaker identity is empty for session ${session.sourceId}`);
    }

    return {
      name: normalized.name,
      title: normalized.title,
      company: normalized.company,
      identityKey,
      dedupeKey: normalized.dedupeKey,
      sessionSourceId: session.sourceId,
      sessionTitle: session.title,
      evidenceUrl: session.sourceUrl,
    };
  });
}

export async function fetchDcwpConference(
  dependencies: DcwpDependencies = {},
): Promise<ConferenceIntelligenceGraph> {
  const fetchText = dependencies.fetchText ?? defaultFetchText;
  const nowFn = dependencies.now ?? (() => new Date());

  // Step 1: Root page schedule link discovery & metadata extraction
  const rootHtml = await fetchText(DEFAULT_ROOT_URL);
  const $root = load(rootHtml);

  let conferenceName = "";
  let rootLocation = "";
  let rawRootStartsAt = "";
  let rawRootEndsAt = "";

  $root('script[type="application/ld+json"]').each((_idx, el) => {
    try {
      const data = JSON.parse($root(el).text());
      const records = Array.isArray(data) ? data : [data];
      for (const rec of records) {
        if (rec["@type"] === "Event") {
          if (rec.name) conferenceName = cleanText(rec.name);
          if (rec.startDate) rawRootStartsAt = cleanText(rec.startDate);
          if (rec.endDate) rawRootEndsAt = cleanText(rec.endDate);
          if (rec.location && typeof rec.location === "object") {
            const locName = cleanText(rec.location.name);
            const addressObj = rec.location.address && typeof rec.location.address === "object" ? rec.location.address : null;
            const locCity = addressObj ? cleanText([addressObj.addressLocality, addressObj.addressRegion].filter(Boolean).join(", ")) : "";
            rootLocation = [locName, locCity].filter(Boolean).join(", ");
          }
        }
      }
    } catch {
      // Ignore JSON-LD parse errors
    }
  });

  if (!conferenceName) {
    conferenceName = cleanText($root("title").first().text()) || "Data Center World Power";
  }

  if (!rootLocation) {
    throw new Error("Could not determine official conference location from event metadata");
  }

  let scheduleHref = "";
  $root("a[href]").each((_idx, el) => {
    if (scheduleHref) return;
    const href = $root(el).attr("href") || "";
    const text = cleanText($root(el).text());
    if (
      /schedule\./i.test(href) ||
      /agenda\./i.test(href) ||
      /\b(?:schedule|agenda)\b/i.test(text)
    ) {
      scheduleHref = href;
    }
  });

  if (!scheduleHref) {
    throw new Error("Schedule discovery failed: No schedule URL found on root page");
  }

  const parsedScheduleUrl = new URL(scheduleHref, DEFAULT_ROOT_URL);
  const scheduleBaseUrl = parsedScheduleUrl.origin + "/";

  // Step 2: Fetch Page 1 of schedule & validate required window globals
  const page1Html = await fetchText(scheduleBaseUrl);
  const $p1 = load(page1Html);

  const eventId = extractWindowGlobal(page1Html, "event_id");
  const ev2Feed = extractWindowGlobal(page1Html, "ev2_feed");
  const feedUrl = extractWindowGlobal(page1Html, "feed_url");
  const localTimezone = extractWindowGlobal(page1Html, "local_timezone");
  const defaultStartTime = extractWindowGlobal(page1Html, "default_start_time");
  const listViewMode = extractWindowGlobal(page1Html, "list_view_mode");

  if (!eventId || !ev2Feed || !feedUrl || !localTimezone || !defaultStartTime || !listViewMode) {
    throw new Error("Missing required window schedule globals in DCWP schedule page 1");
  }

  const tzOffset = extractTzOffset(localTimezone, defaultStartTime);

  const rootStartsAt = rawRootStartsAt ? parseTimestampWithOffset(rawRootStartsAt, tzOffset) : "";
  const rootEndsAt = rawRootEndsAt ? parseTimestampWithOffset(rawRootEndsAt, tzOffset) : "";

  const totalSessionPagesAttr = $p1(".sessions, [data-total-pages]").first().attr("data-total-pages");
  const expectedSessionPages = totalSessionPagesAttr ? parseInt(totalSessionPagesAttr, 10) : 1;
  if (Number.isNaN(expectedSessionPages) || expectedSessionPages <= 0) {
    throw new Error("Invalid session data-total-pages attribute on DCWP schedule");
  }

  // Step 3: Fetch all schedule pages deterministically
  const rawSessions: RawSessionItem[] = [];
  let fetchedSessionPages = 0;

  for (let page = 1; page <= expectedSessionPages; page += 1) {
    const pageUrl = page === 1 ? scheduleBaseUrl : `${scheduleBaseUrl}?page=${page}`;
    const html = page === 1 ? page1Html : await fetchText(pageUrl);
    fetchedSessionPages += 1;

    const $ = load(html);
    const sessionCards = $(".sb5-session-detail");
    if (sessionCards.length === 0) {
      throw new Error(`Schedule page ${page} returned no session details`);
    }

    sessionCards.each((_idx, el) => {
      const card = $(el);
      const titleEl = card.find(".sb5-session-title a").first();
      const title = cleanText(titleEl.text());
      const relativeHref = titleEl.attr("href") ?? "";
      const sourceUrl = relativeHref ? new URL(relativeHref, scheduleBaseUrl).toString() : scheduleBaseUrl;

      let sourceId = "";
      const hrefMatch = relativeHref.match(/\/(\d+)\/?$/);
      if (hrefMatch) {
        sourceId = hrefMatch[1];
      } else {
        const cardIdAttr = card.attr("id") ?? "";
        sourceId = cardIdAttr.replace(/^cal_session_/, "").trim();
      }

      const timeEl = card.find(".sb5-time time").first();
      const rawDatetime = timeEl.attr("datetime") ?? "";
      const startsAt = rawDatetime ? parseTimestampWithOffset(rawDatetime, tzOffset) : "";

      const location = cleanText(card.find(".sb5-location").text().replace(/^Location:\s*/i, ""));
      const track = cleanText(card.find(".sb5-track").text().replace(/^Track:\s*/i, ""));
      const sessionType = cleanText(card.find(".sb5-session_type").text().replace(/^Session Type:\s*/i, ""));

      const agendaSpeakers: Array<{ speakerId: string; name: string; company: string; role: string }> = [];
      const speakerLinks = card.find(".sb5-speakers a.speaker_link");
      speakerLinks.each((_sIdx, sEl) => {
        const sLink = $(sEl);
        const sHref = sLink.attr("href") ?? "";
        const sIdMatch = sHref.match(/\/(\d+)$/);
        const speakerId = sIdMatch ? sIdMatch[1] : slugify(cleanText(sLink.text()));
        const name = cleanText(sLink.text());

        let company = "";
        const nextSpan = sLink.next("span.speaker_company");
        if (nextSpan.length > 0) {
          company = cleanText(nextSpan.text()).replace(/^\(|\)$/g, "").trim();
        }

        const containerText = card.find(".sb5-speakers").text();
        const role = /Sponsor Speaker/i.test(containerText) ? "Sponsor Speaker" : "Speaker";

        agendaSpeakers.push({ speakerId, name, company, role });
      });

      if (sourceId && title) {
        rawSessions.push({
          sourceId,
          sourceUrl,
          title,
          startsAt,
          endsAt: startsAt,
          location,
          track,
          sessionType,
          agendaSpeakers,
        });
      }
    });
  }

  if (fetchedSessionPages !== expectedSessionPages) {
    throw new Error(`Session pagination mismatch: expected ${expectedSessionPages}, fetched ${fetchedSessionPages}`);
  }

  const rawSessionSourceIds = new Set<string>();
  const rawSessionCompositeKeys = new Set<string>();
  for (const session of rawSessions) {
    if (!session.startsAt) {
      throw new Error(`Session ${session.sourceId} is missing a valid start time`);
    }
    if (rawSessionSourceIds.has(session.sourceId)) {
      throw new Error(`Duplicate schedule session source ID detected: ${session.sourceId}`);
    }
    rawSessionSourceIds.add(session.sourceId);

    const compositeKey = `${session.title.toLowerCase()}::${session.startsAt}`;
    if (rawSessionCompositeKeys.has(compositeKey)) {
      throw new Error(`Duplicate schedule session key detected: ${compositeKey}`);
    }
    rawSessionCompositeKeys.add(compositeKey);
  }

  // Step 4: Mandatory CSV Export fetch & parse (fail closed on failure)
  const csvExportUrl = `${scheduleBaseUrl}src/export.php?export_schedule=true&event_id=${eventId}&feed=${ev2Feed}&export_format=csv&export_as=full_schedule&feed_url=${feedUrl}&default_start_time=${encodeURIComponent(defaultStartTime)}&local_timezone=${encodeURIComponent(localTimezone)}&list_view_mode=${listViewMode}&show_these_ids=all_sessions`;

  const csvRawText = await fetchText(csvExportUrl);
  if (!csvRawText || csvRawText.trim().length === 0) {
    throw new Error("Mandatory CSV schedule export returned empty response");
  }

  const records = parse(csvRawText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Array<Record<string, string>>;

  if (!records || records.length === 0) {
    throw new Error("Mandatory CSV schedule export parsed zero records");
  }

  const expectedSessionsCount = records.length;
  if (records.length !== rawSessions.length) {
    throw new Error(`Session count mismatch: schedule cards (${rawSessions.length}) vs CSV export (${records.length})`);
  }

  const csvByCompositeKey = new Map<string, RawCsvSession>();

  for (const record of records) {
    const title = cleanText(record["session title"]);
    const rawStartTime = cleanText(record["start time"]);
    const isoStartTime = parseTimestampWithOffset(rawStartTime, tzOffset);
    const isoEndTime = parseTimestampWithOffset(cleanText(record["end time"]), tzOffset);

    if (!title || !isoStartTime) {
      throw new Error("Malformed CSV schedule record: title and start time are required");
    }

    const key = `${title.toLowerCase()}::${isoStartTime}`;
    if (csvByCompositeKey.has(key)) {
      throw new Error(`Duplicate CSV record key detected: ${key}`);
    }
    csvByCompositeKey.set(key, {
      title,
      startTime: isoStartTime,
      endTime: isoEndTime,
      description: cleanText(record["description"]),
      takeaway: cleanText(record["takeaway"]),
      location: cleanText(record["location"]),
      tracks: cleanText(record["tracks"]),
      format: cleanText(record["format"]),
      speakersStr: cleanText(record["speakers"]),
    });
  }

  for (const key of rawSessionCompositeKeys) {
    if (!csvByCompositeKey.has(key)) {
      throw new Error(`Schedule session key missing from CSV export: ${key}`);
    }
  }
  for (const key of csvByCompositeKey.keys()) {
    if (!rawSessionCompositeKeys.has(key)) {
      throw new Error(`CSV session key missing from schedule pages: ${key}`);
    }
  }

  // Step 5: Enumerate Speaker Directory Pages
  const directoryPage1Url = `${scheduleBaseUrl}speaker-filter?page=1&pageSize=25&viewMode=headshot_view&alphabet=`;
  const dirP1Html = await fetchText(directoryPage1Url);
  const $dirP1 = load(dirP1Html);

  const dirRowFirst = $dirP1.root().find(".sb5-speaker-row-headshot_view").first();
  const totalDirPagesAttr = dirRowFirst.attr("data-total-pages");
  const totalDirItemsAttr = dirRowFirst.attr("data-total-items");

  const expectedSpeakerPages = totalDirPagesAttr ? parseInt(totalDirPagesAttr, 10) : 1;
  if (Number.isNaN(expectedSpeakerPages) || expectedSpeakerPages <= 0) {
    throw new Error("Invalid speaker data-total-pages attribute on DCWP directory");
  }

  if (!totalDirItemsAttr || Number.isNaN(parseInt(totalDirItemsAttr, 10)) || parseInt(totalDirItemsAttr, 10) <= 0) {
    throw new Error("Missing or invalid speaker data-total-items attribute on DCWP directory");
  }
  const expectedIndexedSpeakers = parseInt(totalDirItemsAttr, 10);

  const directorySpeakersMap = new Map<string, RawDirectorySpeaker>();
  let fetchedSpeakerPages = 0;

  for (let page = 1; page <= expectedSpeakerPages; page += 1) {
    const pageUrl = `${scheduleBaseUrl}speaker-filter?page=${page}&pageSize=25&viewMode=headshot_view&alphabet=`;
    const html = page === 1 ? dirP1Html : await fetchText(pageUrl);
    fetchedSpeakerPages += 1;

    const $ = load(html);
    $.root().find(".sb5-session-detail-info").each((_idx, el) => {
      const card = $(el);

      const linkEl = card.find("a[href*='/speaker/']").filter((_i, aEl) => cleanText($(aEl).text()).length > 0).first();
      const name = cleanText(linkEl.text());
      const href = linkEl.attr("href") ?? "";
      const sIdMatch = href.match(/\/(\d+)$/);
      if (!name || !sIdMatch) return;

      const speakerId = sIdMatch[1];
      const sourceUrl = new URL(href, scheduleBaseUrl).toString();
      const emailHref = card.find("a[href^='mailto:']").first().attr("href") ?? "";
      const phoneHref = card.find("a[href^='tel:']").first().attr("href") ?? "";
      const linkedinHref = card.find("a[href*='linkedin.com']").first().attr("href") ?? "";
      const email = cleanText(emailHref.replace(/^mailto:/i, "").split("?")[0]);
      const phone = cleanText(phoneHref.replace(/^tel:/i, "").split("?")[0]);
      let linkedinUrl = "";
      if (linkedinHref) {
        try {
          linkedinUrl = new URL(linkedinHref, scheduleBaseUrl).toString();
        } catch {
          linkedinUrl = "";
        }
      }


      const titleCompanyEl = card.find(".sb5-speakers-page-title").first();
      let title = "";
      let company = "";

      if (titleCompanyEl.length > 0) {
        const companyEl = titleCompanyEl.find(".sb5-speakers-grid-company");
        company = cleanText(companyEl.text());
        const fullTitleCompText = cleanText(titleCompanyEl.text());
        title = company
          ? fullTitleCompText
              .replace(new RegExp(`,?\\s*${company.replace(/[-[\]{}()*+?.:=\\^$|#\s]/g, "\\$&")}$`), "")
              .replace(/,\s*$/, "")
              .trim()
          : fullTitleCompText;
      }

      const incomingSpeaker: RawDirectorySpeaker = {
        speakerId,
        name,
        title,
        company,
        sourceUrl,
        email,
        phone,
        linkedinUrl,
      };
      const existingSpeaker = directorySpeakersMap.get(speakerId);
      directorySpeakersMap.set(
        speakerId,
        existingSpeaker
          ? {
              speakerId: existingSpeaker.speakerId,
              name: existingSpeaker.name || incomingSpeaker.name,
              title: existingSpeaker.title || incomingSpeaker.title,
              company: existingSpeaker.company || incomingSpeaker.company,
              sourceUrl: existingSpeaker.sourceUrl || incomingSpeaker.sourceUrl,
              email: existingSpeaker.email || incomingSpeaker.email,
              phone: existingSpeaker.phone || incomingSpeaker.phone,
              linkedinUrl: existingSpeaker.linkedinUrl || incomingSpeaker.linkedinUrl,
            }
          : incomingSpeaker,
      );
    });
  }

  if (fetchedSpeakerPages !== expectedSpeakerPages) {
    throw new Error(`Directory pagination mismatch: expected ${expectedSpeakerPages}, fetched ${fetchedSpeakerPages}`);
  }

  if (directorySpeakersMap.size !== expectedIndexedSpeakers) {
    throw new Error(
      `Directory item count mismatch: declared ${expectedIndexedSpeakers}, extracted ${directorySpeakersMap.size}`,
    );
  }

  // Step 6: Exact Bidirectional Reconciliation (agenda ⊆ directory AND directory ⊆ agenda)
  const structuredAgendaSpeakerIds = new Set<string>();
  for (const session of rawSessions) {
    for (const spk of session.agendaSpeakers) {
      structuredAgendaSpeakerIds.add(spk.speakerId);
    }
  }

  for (const agendaSpkId of structuredAgendaSpeakerIds) {
    if (!directorySpeakersMap.has(agendaSpkId)) {
      throw new Error(`Reconciliation failure: structured agenda speaker ID ${agendaSpkId} missing from directory`);
    }
  }

  for (const dirSpkId of directorySpeakersMap.keys()) {
    if (!structuredAgendaSpeakerIds.has(dirSpkId)) {
      throw new Error(`Reconciliation failure: directory speaker ID ${dirSpkId} missing from structured agenda`);
    }
  }

  // Step 7: Derive deterministic Conference metadata, startsAt, endsAt, and ID
  const allSessionStartMs = rawSessions
    .map((s) => new Date(s.startsAt).getTime())
    .filter((t) => !Number.isNaN(t));

  const earliestStartMs = rootStartsAt ? new Date(rootStartsAt).getTime() : Math.min(...allSessionStartMs);
  if (Number.isNaN(earliestStartMs) || !Number.isFinite(earliestStartMs)) {
    throw new Error("Could not determine conference start date");
  }

  const conferenceStartsAt = new Date(earliestStartMs).toISOString();

  const allSessionEndMs = rawSessions
    .map((s) => {
      const csvKey = `${s.title.toLowerCase()}::${s.startsAt}`;
      const csvMatch = csvByCompositeKey.get(csvKey);
      const endStr = csvMatch?.endTime || s.startsAt;
      return new Date(endStr).getTime();
    })
    .filter((t) => !Number.isNaN(t));

  const officialEndMs = rootEndsAt ? new Date(rootEndsAt).getTime() : earliestStartMs;
  const maxEndMs = Math.max(officialEndMs, ...allSessionEndMs);
  const conferenceEndsAt = new Date(maxEndMs).toISOString();

  const conferenceId = slugify(`${conferenceName}-${conferenceStartsAt.slice(0, 10)}`);

  const conferenceDomain: Conference = {
    id: conferenceId,
    name: conferenceName,
    sourceUrl: DEFAULT_ROOT_URL,
    location: rootLocation,
    startsAt: conferenceStartsAt,
    endsAt: conferenceEndsAt,
    sourceMode: "live",
    ingestionStatus: "complete",
    lastIngestedAt: nowFn().toISOString(),
  };

  const descriptionCandidatesBySession = new Map<string, DescriptionSpeakerCandidate[]>();
  const directorySpeakerIdentityKeys = new Set(
    [...directorySpeakersMap.values()].map((speaker) => slugify(speaker.name)),
  );
  const expectedDescriptionOnlyIdentityKeys = new Set<string>();

  for (const rawSession of rawSessions) {
    const csvKey = `${rawSession.title.toLowerCase()}::${rawSession.startsAt}`;
    const csvMatch = csvByCompositeKey.get(csvKey);
    if (!csvMatch) {
      throw new Error(`Session missing from CSV export: key ${csvKey}`);
    }

    const candidates = parseDescriptionSpeakerCandidates(csvMatch.description, rawSession);
    descriptionCandidatesBySession.set(rawSession.sourceId, candidates);
    for (const candidate of candidates) {
      if (!directorySpeakerIdentityKeys.has(candidate.identityKey)) {
        expectedDescriptionOnlyIdentityKeys.add(candidate.identityKey);
      }
    }
  }

  // Step 8: Build Speaker map, SessionSpeakers, and parse Description Speakers
  const finalSpeakersMap = new Map<string, Speaker>();
  const sessionSpeakersList: SessionSpeaker[] = [];

  for (const [sId, dirSpk] of directorySpeakersMap.entries()) {
    const domainId = `${conferenceId}:speaker:${sId}`;
    const norm = normalizeSpeaker({
      name: dirSpk.name,
      title: dirSpk.title,
      company: dirSpk.company,
      email: dirSpk.email,
      phone: dirSpk.phone,
      linkedinUrl: dirSpk.linkedinUrl,
      profileUrl: dirSpk.sourceUrl,
      sessionTitle: "",
    });
    finalSpeakersMap.set(sId, {
      id: domainId,
      conferenceId,
      name: norm.name,
      title: norm.title,
      company: norm.company,
      email: norm.email,
      phone: norm.phone,
      linkedinUrl: norm.linkedinUrl,
      profileUrl: norm.profileUrl,
      sessionTitle: "",
      score: 0,
      scoreReasons: [],
      dedupeKey: norm.dedupeKey,
    });
  }

  const extractedDescriptionOnlyIdentityKeys = new Set<string>();

  for (const rawSession of rawSessions) {
    const csvKey = `${rawSession.title.toLowerCase()}::${rawSession.startsAt}`;
    const csvMatch = csvByCompositeKey.get(csvKey);
    if (!csvMatch) {
      throw new Error(`Session missing from CSV export: key ${csvKey}`);
    }
    const descriptionText = csvMatch.description;

    for (const agendaSpk of rawSession.agendaSpeakers) {
      const existingSpeaker = finalSpeakersMap.get(agendaSpk.speakerId);
      if (existingSpeaker) {
        if (!existingSpeaker.sessionTitle) {
          existingSpeaker.sessionTitle = rawSession.title;
        }
        if (agendaSpk.company && !existingSpeaker.company) {
          existingSpeaker.company = agendaSpk.company;
        }
        sessionSpeakersList.push({
          sessionId: `${conferenceId}:session:${rawSession.sourceId}`,
          speakerId: existingSpeaker.id,
          role: agendaSpk.role,
          evidenceUrl: rawSession.sourceUrl,
        });
      }
    }

    const descriptionCandidates = descriptionCandidatesBySession.get(rawSession.sourceId) ?? [];
    for (const candidate of descriptionCandidates) {
      let matchingExistingId: string | null = null;
      for (const [existingId, speaker] of finalSpeakersMap.entries()) {
        if (
          speaker.dedupeKey === candidate.dedupeKey ||
          slugify(speaker.name) === candidate.identityKey
        ) {
          matchingExistingId = existingId;
          break;
        }
      }

      if (matchingExistingId) {
        const existing = finalSpeakersMap.get(matchingExistingId)!;
        if (!existing.sessionTitle) {
          existing.sessionTitle = candidate.sessionTitle;
        }
        sessionSpeakersList.push({
          sessionId: `${conferenceId}:session:${candidate.sessionSourceId}`,
          speakerId: existing.id,
          role: "Description Speaker",
          evidenceUrl: candidate.evidenceUrl,
        });
        continue;
      }

      const descSlug = `${candidate.identityKey}:${slugify(candidate.company || "unknown")}`;
      const domainId = `${conferenceId}:speaker:desc:${descSlug}`;
      const normalized = candidate;
      finalSpeakersMap.set(`desc:${descSlug}`, {
        id: domainId,
        conferenceId,
        name: normalized.name,
        title: normalized.title,
        company: normalized.company,
        email: "",
        phone: "",
        linkedinUrl: "",
        profileUrl: "",
        sessionTitle: candidate.sessionTitle,
        score: 0,
        scoreReasons: [],
        dedupeKey: normalized.dedupeKey,
      });
      extractedDescriptionOnlyIdentityKeys.add(candidate.identityKey);
      sessionSpeakersList.push({
        sessionId: `${conferenceId}:session:${candidate.sessionSourceId}`,
        speakerId: domainId,
        role: "Description Speaker",
        evidenceUrl: candidate.evidenceUrl,
      });
    }
  }

  if (
    expectedDescriptionOnlyIdentityKeys.size !== extractedDescriptionOnlyIdentityKeys.size ||
    [...expectedDescriptionOnlyIdentityKeys].some(
      (identity) => !extractedDescriptionOnlyIdentityKeys.has(identity),
    )
  ) {
    throw new Error(
      `Description-only speaker coverage mismatch: expected ${expectedDescriptionOnlyIdentityKeys.size}, extracted ${extractedDescriptionOnlyIdentityKeys.size}`,
    );
  }

  const expectedTotalSpeakers =
    expectedIndexedSpeakers + expectedDescriptionOnlyIdentityKeys.size;
  if (finalSpeakersMap.size !== expectedTotalSpeakers) {
    throw new Error(
      `Total speaker coverage mismatch: expected ${expectedTotalSpeakers}, extracted ${finalSpeakersMap.size}`,
    );
  }

  // Step 9: Build Sessions and Research Tasks
  const sessionsList: ConferenceSession[] = [];
  const researchTasksList: ResearchTask[] = [];

  const expectedResearchTaskIds = new Set<string>();
  for (const rawSession of rawSessions) {
    const csvKey = `${rawSession.title.toLowerCase()}::${rawSession.startsAt}`;
    const csvMatch = csvByCompositeKey.get(csvKey)!;
    const sessionType = rawSession.sessionType || csvMatch.format || "Session";
    const isLogistics = LOGISTICS_TITLE_PATTERNS.test(rawSession.title);
    const isContentSessionType = CONTENT_SESSION_TYPES.has(sessionType.toLowerCase());
    const hasSpeakers =
      rawSession.agendaSpeakers.length > 0 ||
      descriptionCandidatesBySession.get(rawSession.sourceId)!.length > 0;

    if (!isLogistics && (isContentSessionType || hasSpeakers)) {
      const taskId = `task:${conferenceId}:${rawSession.sourceId}`;
      if (expectedResearchTaskIds.has(taskId)) {
        throw new Error(`Duplicate expected research task ID: ${taskId}`);
      }
      expectedResearchTaskIds.add(taskId);
    }
  }

  for (const rawSession of rawSessions) {
    const csvKey = `${rawSession.title.toLowerCase()}::${rawSession.startsAt}`;
    const csvMatch = csvByCompositeKey.get(csvKey)!;
    const sessionType = rawSession.sessionType || csvMatch.format || "Session";

    const sessionDomainId = `${conferenceId}:session:${rawSession.sourceId}`;
    const sessionObj: ConferenceSession = {
      id: sessionDomainId,
      conferenceId,
      sourceId: rawSession.sourceId,
      sourceUrl: rawSession.sourceUrl,
      title: rawSession.title,
      description: csvMatch.description,
      startsAt: csvMatch.startTime || rawSession.startsAt,
      endsAt: csvMatch.endTime || rawSession.startsAt,
      location: rawSession.location || csvMatch.location || "",
      track: rawSession.track || csvMatch.tracks || "",
      sessionType,
    };
    sessionsList.push(sessionObj);

    const isLogistics = LOGISTICS_TITLE_PATTERNS.test(rawSession.title);
    const isContentSessionType = CONTENT_SESSION_TYPES.has(sessionType.toLowerCase());
    const hasSpeakers = rawSession.agendaSpeakers.length > 0 || /Speakers include:/i.test(csvMatch.description);

    if (!isLogistics && (isContentSessionType || hasSpeakers)) {
      const typeLower = sessionType.toLowerCase();
      const priority =
        typeLower === "keynote"
          ? 100
          : typeLower === "workshop"
            ? 90
            : typeLower === "session"
              ? 80
              : typeLower === "solutions spotlight"
                ? 70
                : typeLower === "tech talk"
                  ? 60
                  : 50;

      const taskId = `task:${conferenceId}:${rawSession.sourceId}`;
      researchTasksList.push({
        id: taskId,
        conferenceId,
        sessionId: sessionDomainId,
        targetUrl: rawSession.sourceUrl,
        title: `Research ${rawSession.title}`,
        status: "pending",
        priority,
        instructions: `Investigate speaker claims, power projects, capacity figures (MW/GW/kV), geographic markets, deployment timelines, and counterparty relationships for session "${rawSession.title}". Include exact evidence URLs. Do not infer missing details. ${RESEARCH_TASK_OUTPUT_INSTRUCTIONS}`,
        claimedBy: null,
        claimedAt: null,
        completedAt: null,
        output: null,
      });
    }
  }

  const extractedResearchTaskIds = new Set(researchTasksList.map((task) => task.id));
  if (
    extractedResearchTaskIds.size !== researchTasksList.length ||
    extractedResearchTaskIds.size !== expectedResearchTaskIds.size ||
    [...expectedResearchTaskIds].some((taskId) => !extractedResearchTaskIds.has(taskId))
  ) {
    throw new Error(
      `Research task coverage mismatch: expected ${expectedResearchTaskIds.size}, extracted ${extractedResearchTaskIds.size}`,
    );
  }

  // Step 10: Score Speakers
  const scoredSpeakers: Speaker[] = [...finalSpeakersMap.values()]
    .map((spk) => {
      const scored = scoreSpeaker(spk);
      return {
        ...spk,
        score: scored.score,
        scoreReasons: scored.reasons,
      };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const sequences = scoredSpeakers
    .filter((s) => s.score >= 60)
    .flatMap((s) => buildSequence(s, conferenceDomain));

  const funnelEvents: FunnelEvent[] = scoredSpeakers.flatMap((s) => {
    const events: FunnelEvent[] = [
      {
        id: `${s.id}:identified`,
        speakerId: s.id,
        stage: FUNNEL_STAGES[0],
        occurredAt: conferenceDomain.lastIngestedAt,
      },
    ];
    if (s.score >= 60) {
      events.push({
        id: `${s.id}:qualified`,
        speakerId: s.id,
        stage: FUNNEL_STAGES[1],
        occurredAt: conferenceDomain.lastIngestedAt,
      });
    }
    return events;
  });

  const coverage: IngestionCoverage = {
    expectedSessionPages,
    fetchedSessionPages,
    expectedSessions: expectedSessionsCount,
    extractedSessions: rawSessions.length,
    expectedSpeakerPages,
    fetchedSpeakerPages,
    expectedIndexedSpeakers,
    extractedIndexedSpeakers: directorySpeakersMap.size,
    structuredAgendaSpeakers: structuredAgendaSpeakerIds.size,
    expectedDescriptionOnlySpeakers: expectedDescriptionOnlyIdentityKeys.size,
    descriptionOnlySpeakers: extractedDescriptionOnlyIdentityKeys.size,
    expectedTotalSpeakers,
    totalSpeakers: finalSpeakersMap.size,
    expectedResearchTasks: expectedResearchTaskIds.size,
    extractedResearchTasks: extractedResearchTaskIds.size,
  };

  return {
    conference: conferenceDomain,
    speakers: scoredSpeakers,
    sequences,
    funnelEvents,
    sessions: sessionsList,
    sessionSpeakers: sessionSpeakersList,
    researchTasks: researchTasksList,
    coverage,
  };
}
