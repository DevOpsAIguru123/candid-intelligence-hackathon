import { load, type CheerioAPI } from "cheerio";
import { RESEARCH_TASK_OUTPUT_INSTRUCTIONS, type ConferenceIntelligenceGraph, type ConferenceSession, type ResearchTask, type SessionSpeaker } from "@/lib/conference-intelligence";
import type { Conference, Speaker } from "@/lib/domain";
import { normalizeSpeaker } from "@/lib/normalize";
import { scoreSpeaker } from "@/lib/scoring";
import { assertCompleteConferenceGraph, buildSpeakerLifecycle, fetchPublicConferenceText, type ConferenceAdapterDependencies } from "@/lib/adapters/shared";

const ROOT_URL = "https://www.powergen.com/";
const AGENDA_URL = "https://www.powergen.com/event-info/event-schedule";
const SPEAKERS_URL = "https://www.powergen.com/speakers";
const AGENDA_SITEMAP_URL = "https://www.powergen.com/__media/sitemap_2027-event-agenda.xml";
const SPEAKER_SITEMAP_URL = "https://www.powergen.com/__media/sitemap_speakers.xml";

export interface PowergenDependencies extends ConferenceAdapterDependencies {
  rootUrl?: string;
  agendaUrl?: string;
  speakersUrl?: string;
  agendaSitemapUrl?: string;
  speakerSitemapUrl?: string;
  speakerPageSize?: number;
}

type Organization = { name?: string };
type Person = {
  "@type"?: string | string[];
  name?: string;
  jobTitle?: string;
  worksFor?: string | Organization | Array<string | Organization>;
  email?: string | string[];
  telephone?: string | string[];
  sameAs?: string | string[];
  url?: string;
  mainEntityOfPage?: string | { "@id"?: string };
};

function fail(message: string): never { throw new Error(`POWERGEN invariant violated: ${message}`); }
function canonical(url: string): string { const value = new URL(url); value.search = ""; value.hash = ""; return value.toString().replace(/\/$/, ""); }
function sitemapUrls(xml: string, collectionUrl: string): string[] { const $ = load(xml, { xmlMode: true }); return $("loc").toArray().map((node) => canonical($(node).text().trim())).filter((url) => url !== canonical(collectionUrl)); }

function directValue(value: string | string[] | undefined, scheme?: "mailto" | "tel"): string {
  const candidate = (Array.isArray(value) ? value : [value]).find((entry) => entry?.trim())?.trim() ?? "";
  if (!scheme || !candidate.toLowerCase().startsWith(`${scheme}:`)) return candidate;
  return candidate.slice(scheme.length + 1).split("?")[0].trim();
}

function organizationName(value: Person["worksFor"]): string {
  for (const organization of Array.isArray(value) ? value : [value]) {
    const name = typeof organization === "string" ? organization : organization?.name;
    if (name?.trim()) return name.trim();
  }
  return "";
}

function jsonLdPeople($: CheerioAPI): Person[] {
  const people: Person[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const types = Array.isArray(record["@type"]) ? record["@type"] : [record["@type"]];
    if (types.includes("Person")) people.push(record as Person);
    if ("@graph" in record) visit(record["@graph"]);
  };
  $("script[type='application/ld+json']").each((_index, node) => {
    try { visit(JSON.parse($(node).text()) as unknown); } catch { /* Ignore unrelated malformed metadata. */ }
  });
  return people;
}

function personProfileUrl(person: Person, baseUrl: string): string {
  const rawUrl = typeof person.mainEntityOfPage === "string" ? person.mainEntityOfPage : person.mainEntityOfPage?.["@id"] ?? person.url;
  return rawUrl ? canonical(new URL(rawUrl, baseUrl).toString()) : "";
}

function linkedinUrl(value: Person["sameAs"], baseUrl: string): string {
  for (const candidate of Array.isArray(value) ? value : [value]) {
    if (!candidate?.trim()) continue;
    try {
      const url = new URL(candidate.trim(), baseUrl);
      if (/(^|\.)linkedin\.com$/i.test(url.hostname)) return url.toString();
    } catch { /* Ignore non-URL sameAs values. */ }
  }
  return "";
}


export async function fetchPowergenConference(dependencies: PowergenDependencies = {}): Promise<ConferenceIntelligenceGraph> {
  const fetchText = dependencies.fetchText ?? ((url) => fetchPublicConferenceText("POWERGEN", url));
  const rootUrl = dependencies.rootUrl ?? ROOT_URL;
  const agendaUrl = dependencies.agendaUrl ?? AGENDA_URL;
  const speakersUrl = dependencies.speakersUrl ?? SPEAKERS_URL;
  const agendaSitemapUrl = dependencies.agendaSitemapUrl ?? AGENDA_SITEMAP_URL;
  const speakerSitemapUrl = dependencies.speakerSitemapUrl ?? SPEAKER_SITEMAP_URL;
  const [rootHtml, agendaHtml, agendaSitemap, speakerSitemap] = await Promise.all([fetchText(rootUrl), fetchText(agendaUrl), fetchText(agendaSitemapUrl), fetchText(speakerSitemapUrl)]);
  const $root = load(rootHtml);
  const rootText = $root("body").text().replace(/\s+/g, " ");
  if (!/January\s+18\s*[-–]\s*21,?\s*2027/i.test(rootText)) fail("advertised January 18-21, 2027 dates are absent");

  const $agenda = load(agendaHtml);
  const declaredSessions = Number($agenda("[data-totalcount]").first().attr("data-totalcount"));
  if (!Number.isInteger(declaredSessions) || declaredSessions <= 0) fail("agenda total is absent or invalid");
  const listUrls = [...new Set([...agendaHtml.matchAll(/openRemoteModal\(['"]([^'"]*2027-event-agenda\/[^'"]+)['"]/g)].map((match) => canonical(new URL(match[1], rootUrl).toString())))];
  const agendaInventory = sitemapUrls(agendaSitemap, new URL("/2027-event-agenda", rootUrl).toString());
  if (listUrls.length !== declaredSessions || agendaInventory.length !== declaredSessions || listUrls.some((url) => !agendaInventory.includes(url))) fail(`agenda inventory drift: declared ${declaredSessions}, list ${listUrls.length}, sitemap ${agendaInventory.length}`);
  const detailHtml = await Promise.all(listUrls.map(fetchText));

  const speakerPageSize = dependencies.speakerPageSize ?? 10;
  const firstSpeakerHtml = await fetchText(speakersUrl);
  const $first = load(firstSpeakerHtml);
  const declaredSpeakers = Number($first("[data-totalcount]").first().attr("data-totalcount"));
  if (!Number.isInteger(declaredSpeakers) || declaredSpeakers <= 0) fail("speaker total is absent or invalid");
  const expectedSpeakerPages = Math.ceil(declaredSpeakers / speakerPageSize);
  const remainingSpeakerHtml = await Promise.all(Array.from({ length: expectedSpeakerPages - 1 }, (_, index) => fetchText(`${speakersUrl}?page=${index + 2}`)));
  const speakerPages = [firstSpeakerHtml, ...remainingSpeakerHtml];
  const speakerInventory = sitemapUrls(speakerSitemap, speakersUrl);

  const conferenceId = "powergen-international-2027";
  const speakerByUrl = new Map<string, Speaker>();
  for (const html of speakerPages) {
    const $ = load(html);
    for (const person of jsonLdPeople($)) {
      if (!person.name) continue;
      const url = personProfileUrl(person, speakersUrl);
      if (!url) fail(`speaker ${person.name} has no canonical URL`);
      const existing = speakerByUrl.get(url);
      const normalized = normalizeSpeaker({
        name: person.name,
        title: person.jobTitle ?? existing?.title ?? "",
        company: organizationName(person.worksFor) || existing?.company || "",
        email: directValue(person.email, "mailto") || existing?.email || "",
        phone: directValue(person.telephone, "tel") || existing?.phone || "",
        linkedinUrl: linkedinUrl(person.sameAs, speakersUrl) || existing?.linkedinUrl || "",
        profileUrl: url,
        sessionTitle: existing?.sessionTitle ?? "",
      });
      const base: Speaker = { id: `${conferenceId}:speaker:${url.split("/").at(-1)}`, conferenceId, ...normalized, score: 0, scoreReasons: [] };
      const scored = scoreSpeaker(base);
      speakerByUrl.set(url, { ...base, score: scored.score, scoreReasons: scored.reasons });
    }
  }
  if (speakerByUrl.size !== declaredSpeakers || speakerInventory.length !== declaredSpeakers || [...speakerByUrl.keys()].some((url) => !speakerInventory.includes(url))) fail(`speaker inventory drift: declared ${declaredSpeakers}, extracted ${speakerByUrl.size}, sitemap ${speakerInventory.length}`);

  const sessions: ConferenceSession[] = [];
  const sessionSpeakers: SessionSpeaker[] = [];
  for (let index = 0; index < detailHtml.length; index += 1) {
    const $ = load(detailHtml[index]);
    const sourceUrl = listUrls[index];
    const sourceId = sourceUrl.split("/").at(-1)!;
    const title = $("meta[property='og:title']").attr("content")?.trim() || $("h2").first().text().replace(/\s+/g, " ").trim() || fail(`session ${sourceId} has no title`);
    const utc = $("[data-time-utc]").toArray().map((node) => $(node).attr("data-time-utc")!).filter(Boolean);
    if (utc.length < 2 || utc.slice(0, 2).some((value) => !Number.isFinite(Date.parse(value)))) fail(`session ${sourceId} lacks two UTC timestamps`);
    const text = $("body").text().replace(/\s+/g, " ");
    const location = $("[class*='location']").first().text().replace(/\s+/g, " ").trim();
    const stream = $("[class*='category'],[class*='type'],[class*='stream']").first().text().replace(/\s+/g, " ").trim();
    const session: ConferenceSession = { id: `${conferenceId}:session:${sourceId}`, conferenceId, sourceId, sourceUrl, title, description: $("[class*='description']").first().text().replace(/\s+/g, " ").trim(), startsAt: new Date(utc[0]).toISOString(), endsAt: new Date(utc[1]).toISOString(), location, track: stream, sessionType: /keynote/i.test(`${stream} ${title}`) ? "Keynote" : /workshop/i.test(`${stream} ${title}`) ? "Workshop" : /registration|reception|networking|lunch|tour|move-in|hall open/i.test(`${stream} ${title} ${text.slice(0, 300)}`) ? "Logistics" : "Session" };
    sessions.push(session);
    $("a[href*='speakers/']").each((_speakerIndex, node) => {
      const href = $(node).attr("href") ?? "";
      const sourcePath = href.match(/['"](speakers\/[^'"]+)['"]/)?.[1] ?? href;
      const url = canonical(new URL(sourcePath, rootUrl).toString());
      const speaker = speakerByUrl.get(url);
      if (!speaker) fail(`session ${sourceId} references unindexed speaker ${url}`);
      const priorText = $(node).parent().prevAll().slice(0, 3).text();
      sessionSpeakers.push({ sessionId: session.id, speakerId: speaker.id, role: /panel moderator|moderator/i.test(priorText) && !/speakers/i.test(priorText) ? "Moderator" : "Speaker", evidenceUrl: sourceUrl });
      if (!speaker.sessionTitle) speaker.sessionTitle = session.title;
    });
  }
  const now = (dependencies.now ?? (() => new Date()))().toISOString();
  const conference: Conference = { id: conferenceId, name: "POWERGEN International 2027", sourceUrl: rootUrl, location: "Salt Palace Convention Center, Salt Lake City, Utah", startsAt: "2027-01-18T14:30:00.000Z", endsAt: "2027-01-21T20:00:00.000Z", sourceMode: "live", ingestionStatus: "complete", lastIngestedAt: now };
  const speakers = [...speakerByUrl.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const researchTasks: ResearchTask[] = sessions.filter((session) => session.sessionType !== "Logistics" && !/technical conference program|center stage content/i.test(session.title)).map((session) => ({ id: `task:${conferenceId}:${session.sourceId}`, conferenceId, sessionId: session.id, targetUrl: session.sourceUrl, title: `Research ${session.title}`, status: "pending", priority: session.sessionType === "Keynote" ? 100 : 80, instructions: `Investigate speaker claims, power projects, capacity, markets, timelines, and counterparties for session "${session.title}". Include exact evidence URLs. Do not infer missing details. ${RESEARCH_TASK_OUTPUT_INSTRUCTIONS}`, claimedBy: null, claimedAt: null, completedAt: null, output: null }));
  const lifecycle = buildSpeakerLifecycle(speakers, conference);
  return assertCompleteConferenceGraph("POWERGEN", { conference, speakers, ...lifecycle, sessions, sessionSpeakers, researchTasks, coverage: { expectedSessionPages: declaredSessions, fetchedSessionPages: detailHtml.length, expectedSessions: declaredSessions, extractedSessions: sessions.length, expectedSpeakerPages, fetchedSpeakerPages: speakerPages.length, expectedIndexedSpeakers: declaredSpeakers, extractedIndexedSpeakers: speakers.length, structuredAgendaSpeakers: new Set(sessionSpeakers.map((relation) => relation.speakerId)).size, expectedDescriptionOnlySpeakers: 0, descriptionOnlySpeakers: 0, expectedTotalSpeakers: declaredSpeakers, totalSpeakers: speakers.length, expectedResearchTasks: researchTasks.length, extractedResearchTasks: researchTasks.length } });
}
