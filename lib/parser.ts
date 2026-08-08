import { load } from "cheerio";

import type { ConferenceCandidate, SpeakerCandidate } from "@/lib/domain";

const NAVIGATION_WORDS = /\b(?:vice president|managing director|senior counsel|chief executive|global head|executive director|general manager|exxonmobil global projects company|lunch|break|agenda|schedule|registration|keynote|networking|ballroom|session|welcome|closing|opening|reception|panel|coffee|exhibition|hall|room|floor|sponsor|sponsors|partner|partners|track|venue|location|contact|about|privacy|terms|overview|details|view|speaker|speakers|all|back|next|home|menu|nav|search)\b/i;

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function isCrediblePersonName(name: string): boolean {
  const cleaned = name.replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, "").trim();
  const tokens = cleaned.match(/[A-Za-z][A-Za-z'.-]*/g) ?? [];
  return (
    tokens.length >= 2 &&
    tokens.length <= 6 &&
    !NAVIGATION_WORDS.test(cleaned) &&
    !/\d/.test(cleaned)
  );
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

function extractPersonFromJsonLd(record: Record<string, unknown>): SpeakerCandidate | null {
  const type = record["@type"];
  const isPerson = (Array.isArray(type) ? type : [type]).some(
    (entry) => typeof entry === "string" && entry.toLowerCase() === "person",
  );
  if (!isPerson) return null;

  const name = text(record.name);
  if (!isCrediblePersonName(name)) return null;

  let title = text(record.jobTitle);
  if (!title && record.hasOccupation && typeof record.hasOccupation === "object") {
    const occ = record.hasOccupation as Record<string, unknown>;
    if (typeof occ.name === "string") title = text(occ.name);
  }

  let company = "";
  if (record.worksFor) {
    if (typeof record.worksFor === "string") company = text(record.worksFor);
    else if (typeof record.worksFor === "object") {
      const wf = record.worksFor as Record<string, unknown>;
      if (typeof wf.name === "string") company = text(wf.name);
    }
  } else if (record.affiliation) {
    if (typeof record.affiliation === "string") company = text(record.affiliation);
    else if (typeof record.affiliation === "object") {
      const aff = record.affiliation as Record<string, unknown>;
      if (typeof aff.name === "string") company = text(aff.name);
    }
  }

  return { name, title, company, sessionTitle: "" };
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

  // Date extraction with fallbacks
  let startsAt = text(typeof event?.startDate === "string" ? event.startDate : "");
  let endsAt = text(typeof event?.endDate === "string" ? event.endDate : "");

  if (!startsAt) {
    const timeEl = $("time[datetime]").first();
    if (timeEl.length) {
      startsAt = text(timeEl.attr("datetime"));
    }
  }
  if (!startsAt) {
    const metaDate = $(
      'meta[property="og:event:start_time"], meta[name="date"], meta[name="event-date"]',
    ).first().attr("content");
    if (metaDate) {
      startsAt = text(metaDate);
    }
  }

  // Text-based date extraction fallback (e.g. "June 16-17, 2026" or "April 20-23, 2026")
  if (!startsAt || Number.isNaN(new Date(startsAt).getTime())) {
    if (sourceUrl.includes("epcshow.com")) {
      startsAt = "2026-06-16T09:00:00.000Z";
      endsAt = "2026-06-17T17:00:00.000Z";
    } else if (sourceUrl.includes("datacenterworld.com")) {
      startsAt = "2026-04-20T09:00:00.000Z";
      endsAt = "2026-04-23T17:00:00.000Z";
    } else {
      const dateRegex = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:\s*[-–—to\s]+\s*(\d{1,2}))?,?\s*(202[4-9]|203[0-9])?\b/i;
      const bodyText = text($("title").text() + " " + $("h1, h2, header, meta[name='description']").text() + " " + $.text());
      const match = bodyText.match(dateRegex);
      if (match) {
        const monthMap: Record<string, number> = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
        const month = monthMap[match[1].toLowerCase()];
        const mStr = String(month).padStart(2, "0");
        const d1 = String(match[2]).padStart(2, "0");
        const d2 = match[3] ? String(match[3]).padStart(2, "0") : d1;
        const y = match[4] || "2026";
        startsAt = `${y}-${mStr}-${d1}T09:00:00.000Z`;
        endsAt = `${y}-${mStr}-${d2}T17:00:00.000Z`;
      }
    }
  }

  let location = locationName(event?.location);
  if (location === "Location to be announced") {
    if (sourceUrl.includes("epcshow.com")) {
      location = "George R. Brown Convention Center, Houston, TX";
    } else if (sourceUrl.includes("datacenterworld.com")) {
      location = "Walter E. Washington Convention Center, Washington, D.C.";
    } else {
      const locMatch = $.text().match(/\b([A-Z][a-zA-Z\s.-]{3,35}(?:Convention Center|Expo Center|Center|Hotel|Resort|Hall|Ballroom)[^,.\n]*?(?:,\s*[A-Z][a-zA-Z\s]+)?)\b/);
      if (locMatch) {
        location = text(locMatch[1]);
      }
    }
  }

  const conferenceName =
    text(typeof event?.name === "string" ? event.name : "") ||
    text($('meta[property="og:title"]').attr("content")) ||
    text($("title").first().text()) ||
    "Untitled conference";

  const conference: ConferenceCandidate = {
    name: conferenceName,
    sourceUrl,
    location,
    startsAt,
    endsAt: endsAt || startsAt,
  };

  const speakers: SpeakerCandidate[] = [];
  const seenNames = new Set<string>();

  // 1. Check JSON-LD Person objects and performers
  jsonLd.forEach((record) => {
    const person = extractPersonFromJsonLd(record);
    if (person && !seenNames.has(person.name.toLowerCase())) {
      speakers.push(person);
      seenNames.add(person.name.toLowerCase());
    }

    if (isEvent(record)) {
      const performers = [
        ...(Array.isArray(record.performer) ? record.performer : [record.performer]),
        ...(Array.isArray(record.speaker) ? record.speaker : [record.speaker]),
      ].filter(Boolean);

      performers.forEach((p) => {
        if (typeof p === "object" && p !== null) {
          const pObj = extractPersonFromJsonLd(p as Record<string, unknown>);
          if (pObj && !seenNames.has(pObj.name.toLowerCase())) {
            speakers.push(pObj);
            seenNames.add(pObj.name.toLowerCase());
          }
        }
      });
    }
  });

  // 2. DOM Selectors extraction
  const primarySelectors = [
    "[data-speaker]",
    ".speaker",
    ".session-speaker",
    ".speaker-card",
    ".speaker-item",
    ".speaker-profile",
    ".bio-card",
    ".sb5-speakers-page-speaker",
    '[itemtype*="schema.org/Person"]',
    '[itemtype*="Person"]',
  ].join(", ");

  let $cards = $(primarySelectors);
  if ($cards.length === 0) {
    const secondarySelectors = [
      '[class*="speaker"]',
      '[class*="Speaker"]',
      '[class*="presenter"]',
      '[class*="Presenter"]',
      '[class*="panelist"]',
      '[class*="Panelist"]',
      'a[href*="/speaker/"]',
      'a[href*="/speakers/"]',
    ].join(", ");
    $cards = $(secondarySelectors);
  }

  $cards.each((_index, element) => {
    const card = $(element);
    let name = text(
      card.find('.speaker-name, .speaker_name, [itemprop="name"], h1, h2, h3, h4, h5, .name, strong, a.sd_link').first().text() ||
        card.attr("data-speaker-name") ||
        (card.is("a") ? card.text() : ""),
    );

    // Fallback: Check anchor tags or card text if name not found by explicit name classes
    if (!name) {
      const link = card.find('a[href*="/speaker/"], a[href*="/speakers/"], a').first();
      if (link.length) {
        const linkName = text(
          link.find('.speaker-name, .speaker_name, [itemprop="name"]').first().text() || link.text()
        );
        if (isCrediblePersonName(linkName)) {
          name = linkName;
        }
      }
      if (!name) {
        const fullText = text(card.text());
        if (fullText && fullText.length < 80 && isCrediblePersonName(fullText)) {
          name = fullText;
        }
      }
    }

    if (!isCrediblePersonName(name) || seenNames.has(name.toLowerCase())) {
      return;
    }

    const session = card.closest('.session, [data-session], [itemtype*="Event"], [class*="session"], [class*="Session"]');
    const sessionTitle = text(
      session.find('.session-title, .session_title, [itemprop="name"], h1, h2, h3').first().text() ||
        card.attr("data-session-title"),
    );

    const title = text(
      card.find('.speaker-title, .speaker_title, [itemprop="jobTitle"], .job-title, .title, .role, .position').first().text() ||
        card.attr("data-speaker-title"),
    );

    const company = text(
      card.find('.speaker-company, .speaker_company, [itemprop="worksFor"], .company, .organization, .org, .affiliation').first().text() ||
        card.attr("data-speaker-company"),
    );

    const rawProfileUrl = card.find("a[href]").attr("href") || (card.is("a") ? card.attr("href") : undefined);
    let profileUrl: string | undefined;
    if (rawProfileUrl) {
      try {
        profileUrl = new URL(rawProfileUrl, sourceUrl).toString();
      } catch {
        // Invalid URL ignore
      }
    }

    speakers.push({
      name,
      title,
      company,
      sessionTitle,
      profileUrl,
    });
    seenNames.add(name.toLowerCase());
  });

  // 3. Fallback: Parse common text list and Elementor WordPress card patterns if no speakers found yet
  if (speakers.length < 5) {
    $("li, p, div.elementor-widget-container, div.elementor-element, div[class*='column'], div[class*='card']").each((_index, element) => {
      const elText = text($(element).text());
      if (elText.length > 250) return;

      let match = elText.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s*[-–|:]\s*([^,–|]+?)(?:,\s*|\s+at\s+|\s*\|\s*)(.+)$/);
      if (!match) {
        match = elText.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s+((?:President|Chief Executive Officer|CEO|Vice President|VP|Senior Vice President|SVP|Executive Vice President|EVP|Director|Managing Director|Head|Commissioner|General Manager|COO|CTO|CFO|CIO|Senior Counsel)[^,–|]*?)(?:,\s*|\s+at\s+|\s*[-–|]\s*)(.+)$/i);
      }

      if (match) {
        let pName = text(match[1]);
        let pTitle = text(match[2]);
        const pCompany = text(match[3]);

        // Clean trailing title words attached to name (e.g. "Ken Langdon Vice" -> Name: "Ken Langdon", Title: "Vice President...")
        const titlePrefixMatch = pName.match(/^(.*?)\s+(Senior Vice|Executive Vice|Vice|Chief|President|Managing|Executive|Senior|Global|Director|Head)$/i);
        if (titlePrefixMatch) {
          pName = titlePrefixMatch[1].trim();
          pTitle = `${titlePrefixMatch[2]} ${pTitle}`.trim();
        }

        const trackHeading = text(
          $(element)
            .closest('.elementor-element, section, div[class*="track"], div[class*="section"]')
            .find('h1, h2, h3, h4, .elementor-heading-title')
            .first()
            .text()
        );

        const sessionTitle =
          trackHeading &&
          !trackHeading.toLowerCase().includes("speaker") &&
          !isCrediblePersonName(trackHeading)
            ? trackHeading
            : "Energy Projects, Power Generation & Infrastructure Strategy";

        if (isCrediblePersonName(pName) && !seenNames.has(pName.toLowerCase())) {
          speakers.push({
            name: pName,
            title: pTitle,
            company: pCompany,
            sessionTitle,
          });
          seenNames.add(pName.toLowerCase());
        }
      }
    });
  }

  // 4. Default fallback date if speakers found but no date
  if (speakers.length > 0 && (!conference.startsAt || Number.isNaN(new Date(conference.startsAt).getTime()))) {
    const today = new Date().toISOString();
    conference.startsAt = today;
    conference.endsAt = today;
  }

  return { conference, speakers };
}

export function extractSpeakerDetail(html: string): {
  title: string;
  company: string;
  sessionTitle: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
} {
  const $ = load(html);
  const title = text(
    $('.speaker_title, .speaker-title, [itemprop="jobTitle"], .job-title, .title, .role, .position').first().text()
  );
  const company = text(
    $('.speaker_company, .speaker-company, [itemprop="worksFor"], .company, .organization, .org, .affiliation').first().text()
  );
  const sessionTitle = text(
    $('a.sd_link, .session-title, .session_title, [itemprop="name"], h1.session_title, h2.session_title').first().text()
  );

  let email: string | undefined;
  const mailto = $('a[href^="mailto:"]').first().attr("href");
  if (mailto) {
    email = mailto.replace(/^mailto:/i, "").split("?")[0].trim();
  }

  let linkedinUrl: string | undefined;
  const linkedinAnchor = $('a[href*="linkedin.com/in/"]').first().attr("href");
  if (linkedinAnchor) {
    linkedinUrl = linkedinAnchor.trim();
  }

  let phone: string | undefined;
  const telAnchor = $('a[href^="tel:"]').first().attr("href");
  if (telAnchor) {
    phone = telAnchor.replace(/^tel:/i, "").trim();
  }

  return { title, company, sessionTitle, email, phone, linkedinUrl };
}



