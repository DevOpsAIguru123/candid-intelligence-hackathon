/**
 * Seeded catalog of recurring public energy conferences.
 *
 * Most industry events repeat annually in the same window, so the calendar can
 * project the next edition before an agenda is published and start watching it
 * without a human adding anything. Projected dates are always labeled as
 * projected in the interface; a confirmed date only comes from an ingested
 * agenda. Month and day are the historical window, not a promise from the
 * organizer.
 */
export interface ConferenceSeries {
  id: string;
  name: string;
  organizer: string;
  /** Public landing page. The exact agenda path is resolved at check time. */
  agendaUrl: string;
  location: string;
  /** Historical start month, 1-12. */
  typicalStartMonth: number;
  /** Historical start day of month. */
  typicalStartDay: number;
  typicalDurationDays: number;
  /** How close the audience sits to Candid's ICP. */
  lens: "core" | "adjacent";
  /** Why this series is on the watchlist at all. */
  note: string;
  /** Case-insensitive tokens used to attach an ingested conference to this series. */
  match: string[];
}

export const CONFERENCE_SERIES: ConferenceSeries[] = [
  {
    id: "data-center-world-power",
    name: "Data Center World Power",
    organizer: "Informa",
    agendaUrl: "https://www.datacenterworld.com",
    location: "Washington, D.C.",
    typicalStartMonth: 4,
    typicalStartDay: 14,
    typicalDurationDays: 4,
    lens: "core",
    note: "Agenda lists each session as speaker plus organization, and the power track is squarely behind-the-meter.",
    match: ["data center world"],
  },
  {
    id: "dtech-data-centers-ai",
    name: "DTECH Data Centers & AI",
    organizer: "Clarion Events",
    agendaUrl: "https://www.dtechdatacenters.com",
    location: "Denver, Colorado",
    typicalStartMonth: 9,
    typicalStartDay: 22,
    typicalDurationDays: 3,
    lens: "core",
    note: "Utility and developer leaders presenting on serving new AI load.",
    match: ["dtech", "distributech"],
  },
  {
    id: "ceraweek",
    name: "CERAWeek",
    organizer: "S&P Global",
    agendaUrl: "https://ceraweek.com",
    location: "Houston, Texas",
    typicalStartMonth: 3,
    typicalStartDay: 9,
    typicalDurationDays: 5,
    lens: "core",
    note: "The densest concentration of energy decision-makers in Houston each March.",
    match: ["ceraweek", "cera week"],
  },
  {
    id: "powergen-international",
    name: "POWERGEN International",
    organizer: "Clarion Events",
    agendaUrl: "https://www.powergen.com",
    location: "Dallas, Texas",
    typicalStartMonth: 2,
    typicalStartDay: 3,
    typicalDurationDays: 3,
    lens: "core",
    note: "Generation owners and EPC delivery leads, heavy on gas-to-power execution.",
    match: ["powergen", "power-gen"],
  },
  {
    id: "gastech",
    name: "Gastech",
    organizer: "dmg events",
    agendaUrl: "https://www.gastechevent.com",
    location: "Rotating host city",
    typicalStartMonth: 9,
    typicalStartDay: 9,
    typicalDurationDays: 4,
    lens: "adjacent",
    note: "Gas value chain leadership; relevant where gas supply meets new power demand.",
    match: ["gastech"],
  },
  {
    id: "reuters-events-energy",
    name: "Reuters Events: Energy Transition North America",
    organizer: "Reuters Events",
    agendaUrl: "https://www.reutersevents.com/events",
    location: "Houston, Texas",
    typicalStartMonth: 6,
    typicalStartDay: 9,
    typicalDurationDays: 2,
    lens: "adjacent",
    note: "Utility and developer executives; strategy-level but reliably senior.",
    match: ["reuters events", "energy transition north america"],
  },
  {
    id: "infocast-power-summits",
    name: "Infocast Power & Data Center Summits",
    organizer: "Infocast",
    agendaUrl: "https://infocastinc.com",
    location: "Varies by summit",
    typicalStartMonth: 1,
    typicalStartDay: 20,
    typicalDurationDays: 3,
    lens: "core",
    note: "Project-finance and development audiences, often the earliest stage of a real project.",
    match: ["infocast"],
  },
];

export function getConferenceSeries(): ConferenceSeries[] {
  return CONFERENCE_SERIES;
}
