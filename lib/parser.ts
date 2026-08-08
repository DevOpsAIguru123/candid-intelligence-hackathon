import { load } from "cheerio";

import type { ConferenceCandidate, SpeakerCandidate } from "@/lib/domain";

const NAVIGATION_WORDS = /\b(?:lunch|break|agenda|schedule|registration|keynote|networking|ballroom|session)\b/i;

function text(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function isCrediblePersonName(name: string): boolean {
  const tokens = name.match(/[A-Za-z][A-Za-z'.-]*/g) ?? [];
  return tokens.length >= 2 && tokens.length <= 6 && !NAVIGATION_WORDS.test(name);
}

function flattenJsonLd(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.flatMap(flattenJsonLd);
  }
  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const graph = Array.isArray(record["@graph"]) ? flattenJsonLd(record["@graph"]) : [];
  return [record, ...graph];
}

function locationName(value: unknown): string {
  if (typeof value === "string") {
    return text(value);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.name === "string") {
      return text(record.name);
    }
    if (record.address && typeof record.address === "object") {
      const address = record.address as Record<string, unknown>;
      return text([address.addressLocality, address.addressRegion].filter(Boolean).join(", "));
    }
  }
  return "Location to be announced";
}

function isEvent(record: Record<string, unknown>): boolean {
  const type = record["@type"];
  return (Array.isArray(type) ? type : [type]).some(
    (entry) => typeof entry === "string" && entry.toLowerCase().includes("event"),
  );
}

export function extractConference(
  html: string,
  sourceUrl: string,
): { conference: ConferenceCandidate; speakers: SpeakerCandidate[] } {
  const $ = load(html);
  const jsonLd: Record<string, unknown>[] = [];

  $('script[type="application/ld+json"]').each((_index, element) => {
    try {
      jsonLd.push(...flattenJsonLd(JSON.parse($(element).text())));
    } catch {
      // Broken JSON-LD should not prevent DOM extraction.
    }
  });

  const event = jsonLd.find(isEvent);
  const conference: ConferenceCandidate = {
    name: text(typeof event?.name === "string" ? event.name : $("title").first().text()) || "Untitled conference",
    sourceUrl,
    location: locationName(event?.location),
    startsAt: text(typeof event?.startDate === "string" ? event.startDate : ""),
    endsAt: text(
      typeof event?.endDate === "string"
        ? event.endDate
        : typeof event?.startDate === "string"
          ? event.startDate
          : "",
    ),
  };

  const speakers: SpeakerCandidate[] = [];
  const selector = '[data-speaker], .speaker, .session-speaker, [itemtype*="schema.org/Person"]';

  $(selector).each((_index, element) => {
    const card = $(element);
    const name = text(
      card.find('.speaker-name, [itemprop="name"], h3, h4').first().text() ||
        card.attr("data-speaker-name"),
    );
    if (!isCrediblePersonName(name)) {
      return;
    }

    const session = card.closest('.session, [data-session], [itemtype*="Event"]');
    const sessionTitle = text(
      session.find('.session-title, [itemprop="name"], h1, h2').first().text() ||
        card.attr("data-session-title"),
    );

    speakers.push({
      name,
      title: text(
        card.find('.speaker-title, [itemprop="jobTitle"], .job-title').first().text() ||
          card.attr("data-speaker-title"),
      ),
      company: text(
        card
          .find('.speaker-company, [itemprop="worksFor"], .company, .organization')
          .first()
          .text() || card.attr("data-speaker-company"),
      ),
      sessionTitle,
    });
  });

  return { conference, speakers };
}
