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
    pattern: /\b(?:vp|vice president|head|director|chief|president)\b/i,
  },
  {
    group: "function",
    points: 20,
    reason: "Runs engineering or project delivery",
    source: (speaker) => speaker.title,
    pattern: /\b(?:engineering?|project delivery|development|construction|infrastructure)\b/i,
  },
  {
    group: "company",
    points: 25,
    reason: "Works for an energy owner, developer, or operator",
    source: (speaker) => speaker.company,
    pattern: /\b(?:energy|power|utility|utilities|developer|development|owner[- ]operator|infrastructure)\b/i,
  },
  {
    group: "topic",
    points: 20,
    reason: "Talking about power for data centers or the grid",
    source: (speaker) => speaker.sessionTitle,
    pattern:
      /\b(?:data[ -]?cent(?:er|re)s?|ai campus|power generation|behind[ -]?the[ -]?meter|gas[ -]?to[ -]?power|interconnection|reliability|grid infrastructure)\b/i,
  },
  {
    group: "specificity",
    points: 10,
    reason: "Mentions a real project, its size, or where it is",
    source: (speaker) => speaker.sessionTitle,
    pattern: /(?:\b\d+(?:\.\d+)?\s?(?:mw|gw|kv)\b|\b(?:texas|houston|ercot|project|campus|facility|plant)\b)/i,
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

  const score = Math.min(
    100,
    reasons.reduce((total, reason) => total + reason.points, 0),
  );

  return {
    score,
    reasons,
    tier: score >= 80 ? "high" : score >= 60 ? "qualified" : "monitor",
  };
}
