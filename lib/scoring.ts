import type { ScoreGroup, ScoreReason, Speaker } from "@/lib/domain";

export type ScoreTier = "high" | "qualified" | "monitor";

interface Rule {
  group: ScoreGroup;
  points: number;
  reason: string;
  source: (speaker: Speaker) => string;
  pattern: RegExp;
}

const RULES: Rule[] = [
  {
    group: "seniority",
    points: 25,
    reason: "Senior decision-maker",
    source: (speaker) => speaker.title,
    pattern: /\b(?:vp|vice president|head|director|chief|president|cfo|cto|ceo|cio|coo|executive director|managing director|principal)\b/i,
  },
  {
    group: "function",
    points: 20,
    reason: "Engineering, energy, or project-delivery leader",
    source: (speaker) => `${speaker.title} ${speaker.sessionTitle}`,
    pattern: /\b(?:engineering?|project delivery|development|construction|infrastructure|operations)\b/i,
  },
  {
    group: "company",
    points: 25,
    reason: "Works for an energy owner, developer, or operator",
    source: (speaker) => `${speaker.company} ${speaker.title}`,
    pattern:
      /\b(?:cyrusone|switch|qts|equinix|digital realty|compass datacenters|aligned data centers|vantage data centers|microsoft|google|meta|oracle|amazon|aws|iron mountain|ntt|sabey|stack infrastructure|edgeconnex|databank|flexential|coresite|yondr|voltagrid|rpower|kairos power|wtg energy|proenergy|standard energy|electric powers|energy|power|utility|utilities|developer|owner|operator|infrastructure|grid|microgrid)\b/i,
  },
  {
    group: "topic",
    points: 20,
    reason: "Session aligns with priority power infrastructure themes",
    source: (speaker) => speaker.sessionTitle,
    pattern:
      /\b(?:data[ -]?cent(?:er|re)s?|ai campus|power generation|behind[ -]?the[ -]?meter|gas[ -]?to[ -]?power|interconnection|reliability|grid infrastructure|power|energy|microgrid|nuclear|utility|capacity)\b/i,
  },
  {
    group: "specificity",
    points: 10,
    reason: "Session contains a concrete project, capacity, or market signal",
    source: (speaker) => speaker.sessionTitle,
    pattern:
      /(?:\b\d+(?:\.\d+)?\s?(?:mw|gw|kv)\b|\b(?:texas|houston|ercot|project|campus|facility|plant|ai infrastructure|hyperscale|gpu clusters|accelerated computing|data[ -]?center expansion|high density)\b)/i,
  },
];

export function scoreSpeaker(speaker: Speaker): {
  score: number;
  reasons: ScoreReason[];
  tier: ScoreTier;
} {
  const reasons = RULES.flatMap((rule): ScoreReason[] => {
    const evidence = rule.source(speaker).trim();
    if (!evidence || !rule.pattern.test(evidence)) {
      return [];
    }

    return [
      {
        group: rule.group,
        points: rule.points,
        reason: rule.reason,
        evidence,
      },
    ];
  });

  // Apply vendor / consultant penalty (-15) if purely sales/vendor role
  const isVendorOrConsultant =
    /\b(?:sales|account executive|business development|marketing|pr|media|analyst|editor|journalist|consultant|underwriter|evangelist)\b/i.test(
      speaker.title,
    );
  if (isVendorOrConsultant) {
    reasons.push({
      group: "function",
      points: -15,
      reason: "Vendor, sales, consultant, or analyst role penalty",
      evidence: speaker.title,
    });
  }

  const rawScore = reasons.reduce((total, reason) => total + reason.points, 0);
  const score = Math.max(0, Math.min(100, rawScore));

  return {
    score,
    reasons,
    tier: score >= 80 ? "high" : score >= 60 ? "qualified" : "monitor",
  };
}

