import { getConferenceSeries } from "@/data/conference-series";
import { buildCalendar, summarizeCalendar, type CalendarPayload } from "@/lib/calendar";
import { getRepository } from "@/lib/repository";

/**
 * The single read path behind both the calendar page and its polling endpoint,
 * so a server render and a client refresh can never disagree about shape.
 */
export function readCalendar(now = new Date()): CalendarPayload {
  const repository = getRepository();
  const entries = buildCalendar({
    series: getConferenceSeries(),
    conferences: repository.listConferences(),
    speakers: repository.listSpeakers(),
    now,
  });
  return { generatedAt: now.toISOString(), summary: summarizeCalendar(entries), entries };
}
