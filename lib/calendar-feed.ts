import { getConferenceSeries } from "@/data/conference-series";
import { buildCalendar, summarizeCalendar, type CalendarPayload } from "@/lib/calendar";
import { getRepository } from "@/lib/conference-repository";

/**
 * The single read path behind both the calendar page and its polling endpoint,
 * so a server render and a client refresh can never disagree about shape.
 */
export async function readCalendar(now = new Date()): Promise<CalendarPayload> {
  const repository = getRepository();
  const [conferences, speakers] = await Promise.all([
    repository.listConferences(),
    repository.listSpeakers(),
  ]);
  const entries = buildCalendar({
    series: getConferenceSeries(),
    conferences,
    speakers,
    now,
  });
  return { generatedAt: now.toISOString(), summary: summarizeCalendar(entries), entries };
}
