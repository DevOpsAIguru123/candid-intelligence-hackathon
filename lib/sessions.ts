import type { IngestionCoverage, SpeakerSession } from "@/lib/domain";

/**
 * Presentation rules for agenda sessions.
 *
 * Two things the source data gets wrong and the interface must not repeat:
 * the scraper writes a sentence into the track column when a session has no
 * track, and session times are stored in UTC while people navigate a venue in
 * local time.
 */

/** Strings the agenda source writes when it has no real track value. */
const EMPTY_TRACK_MARKERS = ["", "no tracks found for this session", "n/a", "none"];

export function cleanTrack(track: string | undefined): string {
  const value = (track ?? "").trim();
  return EMPTY_TRACK_MARKERS.includes(value.toLowerCase()) ? "" : value;
}

/** A slot bought by a sponsor is not the same buying signal as an earned one. */
export function isSponsorSlot(role: string | undefined): boolean {
  return (role ?? "").toLowerCase().includes("sponsor");
}

export function formatRole(role: string | undefined): string {
  const value = (role ?? "").trim();
  if (!value || value.toLowerCase() === "speaker") return "";
  if (value.toLowerCase() === "description speaker") return "Named in the description";
  return value;
}

/**
 * "Tue 22 Sep · 8:45 AM". Falls back to UTC until the source supplies the
 * venue timezone, and says so rather than showing a confidently wrong time.
 */
export function formatSessionWhen(session: SpeakerSession, timezone?: string): string {
  const zone = timezone || "UTC";
  const start = new Date(session.startsAt);
  if (Number.isNaN(start.getTime())) return "Time not published";

  const day = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: zone,
  }).format(start);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: zone,
  }).format(start);

  return `${day} · ${time}${timezone ? "" : " UTC"}`;
}

/** The session that best represents a speaker: their earned slot, earliest first. */
export function primarySession(sessions?: SpeakerSession[]): SpeakerSession | null {
  if (!sessions?.length) return null;
  const ranked = [...sessions].sort((left, right) => {
    const sponsor = Number(isSponsorSlot(left.role)) - Number(isSponsorSlot(right.role));
    if (sponsor !== 0) return sponsor;
    return Date.parse(left.startsAt) - Date.parse(right.startsAt);
  });
  return ranked[0];
}

export function formatCoverage(coverage: IngestionCoverage | undefined): string | null {
  if (!coverage) return null;
  return `${coverage.extractedSessions} of ${coverage.expectedSessions} sessions read · ${coverage.totalSpeakers} of ${coverage.expectedTotalSpeakers} speakers extracted`;
}
