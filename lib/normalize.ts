import type { SpeakerCandidate } from "@/lib/domain";

export type NormalizedSpeakerCandidate = SpeakerCandidate & { dedupeKey: string };

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function companyKey(company: string): string {
  const withoutSuffix = collapseWhitespace(company)
    .replace(/[,\s]+(?:llc|l\.l\.c\.?|inc\.?|incorporated|corp\.?|corporation|ltd\.?|limited)$/i, "")
    .trim();
  return slug(withoutSuffix);
}

function preferRichValue(current: string, candidate: string): string {
  const normalizedCandidate = collapseWhitespace(candidate);
  return normalizedCandidate.length > current.length ? normalizedCandidate : current;
}

export function normalizeSpeaker(candidate: SpeakerCandidate): NormalizedSpeakerCandidate {
  const name = collapseWhitespace(candidate.name);
  const title = collapseWhitespace(candidate.title);
  const company = collapseWhitespace(candidate.company);
  const sessionTitle = collapseWhitespace(candidate.sessionTitle);

  return {
    name,
    title,
    company,
    sessionTitle,
    dedupeKey: `${slug(name)}::${companyKey(company)}`,
  };
}

export function deduplicateSpeakers(
  candidates: SpeakerCandidate[],
): NormalizedSpeakerCandidate[] {
  const byKey = new Map<string, NormalizedSpeakerCandidate>();

  for (const rawCandidate of candidates) {
    const candidate = normalizeSpeaker(rawCandidate);
    const existing = byKey.get(candidate.dedupeKey);
    if (!existing || !candidate.dedupeKey.split("::").every(Boolean)) {
      byKey.set(existing ? `${candidate.dedupeKey}:${byKey.size}` : candidate.dedupeKey, candidate);
      continue;
    }

    byKey.set(candidate.dedupeKey, {
      ...existing,
      title: preferRichValue(existing.title, candidate.title),
      company: preferRichValue(existing.company, candidate.company),
      sessionTitle: preferRichValue(existing.sessionTitle, candidate.sessionTitle),
    });
  }

  return [...byKey.values()];
}
