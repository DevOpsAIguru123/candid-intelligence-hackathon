import type { Conference, SequenceStep, Speaker } from "@/lib/domain";

const DAY_MS = 24 * 60 * 60 * 1000;
const OPT_OUT = "If this is not relevant, you can opt out at any time.";

interface SequenceDefinition {
  offsetDays: number;
  channel: "email" | "in_person";
  subject: (speaker: Speaker, conference: Conference) => string;
  message: (speaker: Speaker, conference: Conference) => string;
}

const DEFINITIONS: SequenceDefinition[] = [
  {
    offsetDays: -14,
    channel: "email",
    subject: (speaker, conference) => `${conference.name}: ${speaker.sessionTitle}`,
    message: (speaker, conference) =>
      `Hi ${speaker.name}, your session on "${speaker.sessionTitle}" at ${conference.name} stood out. ` +
      `Your work as ${speaker.title} at ${speaker.company} is closely aligned with the power infrastructure conversations we support. ` +
      `Would a brief conversation before the event be useful? ${OPT_OUT}`,
  },
  {
    offsetDays: -7,
    channel: "email",
    subject: (_speaker, conference) => `Following up before ${conference.name}`,
    message: (speaker, conference) =>
      `Hi ${speaker.name}, following up ahead of ${conference.name}. ` +
      `I would value your perspective on "${speaker.sessionTitle}" and the priorities you are seeing at ${speaker.company}. ` +
      `Would you have 15 minutes at the event? ${OPT_OUT}`,
  },
  {
    offsetDays: -2,
    channel: "email",
    subject: (_speaker, conference) => `Meet at ${conference.name}?`,
    message: (speaker, conference) =>
      `Hi ${speaker.name}, with ${conference.name} coming up, would you be open to a quick meeting near your session? ` +
      `I am especially interested in your work on "${speaker.sessionTitle}." ${OPT_OUT}`,
  },
  {
    offsetDays: 0,
    channel: "in_person",
    subject: (speaker) => `Meet ${speaker.name} at the event`,
    message: (speaker) =>
      `Internal reminder: introduce yourself to ${speaker.name}, ${speaker.title} at ${speaker.company}, and reference "${speaker.sessionTitle}."`,
  },
  {
    offsetDays: 2,
    channel: "email",
    subject: (_speaker, conference) => `After ${conference.name}`,
    message: (speaker, conference) =>
      `Hi ${speaker.name}, thank you for the perspective you shared around "${speaker.sessionTitle}" at ${conference.name}. ` +
      `Would a 20-minute follow-up about ${speaker.company}'s infrastructure priorities be useful? ${OPT_OUT}`,
  },
];

function addDays(isoDate: string, offsetDays: number): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Conference start date is invalid");
  }
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString();
}

export function buildSequence(speaker: Speaker, conference: Conference): SequenceStep[] {
  return DEFINITIONS.map((definition) => ({
    id: `${speaker.id}:${definition.offsetDays}`,
    speakerId: speaker.id,
    offsetDays: definition.offsetDays,
    scheduledAt: addDays(conference.startsAt, definition.offsetDays),
    channel: definition.channel,
    status: definition.offsetDays === -14 ? "drafted" : "pending",
    subject: definition.subject(speaker, conference),
    message: definition.message(speaker, conference),
  }));
}

export function buildWhyNow(
  speaker: Speaker,
  conference: Conference,
  now = new Date(),
): { daysUntil: number; summary: string; action: string } {
  const startsAt = new Date(conference.startsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(now.getTime())) {
    throw new Error("Why Now requires valid dates");
  }

  const daysUntil = Math.max(0, Math.ceil((startsAt.getTime() - now.getTime()) / DAY_MS));
  const timing = daysUntil === 0 ? "today" : `in ${daysUntil} days`;
  const evidence = speaker.scoreReasons[0]?.reason ?? `${speaker.title} at ${speaker.company}`;

  return {
    daysUntil,
    summary: `${speaker.name} is speaking about "${speaker.sessionTitle}" ${timing}. ${evidence}.`,
    action: `Request a 15-minute meeting with ${speaker.name} at ${conference.name}.`,
  };
}
