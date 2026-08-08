import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { fetchDcwpConference } from "@/lib/adapters/dcwp";

const eventHtml = readFileSync(join(__dirname, "fixtures/dcwp/event.html"), "utf8");
const schedule1Html = readFileSync(join(__dirname, "fixtures/dcwp/schedule-1.html"), "utf8");
const schedule2Html = readFileSync(join(__dirname, "fixtures/dcwp/schedule-2.html"), "utf8");
const fullScheduleCsv = readFileSync(join(__dirname, "fixtures/dcwp/full-schedule.csv"), "utf8");
const speaker1Html = readFileSync(join(__dirname, "fixtures/dcwp/speaker-1.html"), "utf8");
const speaker2Html = readFileSync(join(__dirname, "fixtures/dcwp/speaker-2.html"), "utf8");

function buildStandardFetchMap(): Map<string, string> {
  const map = new Map<string, string>();
  map.set("https://dcwpower.com/", eventHtml);
  map.set("https://agenda.example.test/", schedule1Html);
  map.set("https://agenda.example.test/?page=2", schedule2Html);
  map.set(
    "https://agenda.example.test/src/export.php?export_schedule=true&event_id=481&feed=tensubs&export_format=csv&export_as=full_schedule&feed_url=24798bef429&default_start_time=2026-09-21T09%3A00-0500&local_timezone=CDT%3A-0500&list_view_mode=scheduled&show_these_ids=all_sessions",
    fullScheduleCsv,
  );
  map.set("https://agenda.example.test/speaker-filter?page=1&pageSize=25&viewMode=headshot_view&alphabet=", speaker1Html);
  map.set("https://agenda.example.test/speaker-filter?page=2&pageSize=25&viewMode=headshot_view&alphabet=", speaker2Html);
  return map;
}

describe("fetchDcwpConference adapter contract and behavior", () => {
  it("satisfies output contract on happy-path fixture", async () => {
    const fetchMap = buildStandardFetchMap();
    const fetchedUrls: string[] = [];

    const graph = await fetchDcwpConference({
      fetchText: async (url) => {
        fetchedUrls.push(url);
        const res = fetchMap.get(url);
        if (!res) throw new Error(`404: Unmapped URL ${url}`);
        return res;
      },
      now: () => new Date("2026-09-21T12:00:00.000Z"),
    });

    // 1. Deterministic conference ID & name/location/startsAt/endsAt
    expect(graph.conference.id).toBe("data-center-world-power-fixture-2026-09-21");
    expect(graph.conference.name).toBe("Data Center World Power Fixture");
    expect(graph.conference.location).toBe("Gaylord Texan Resort & Convention Center");
    expect(graph.conference.startsAt).toBe("2026-09-21T05:00:00.000Z");
    expect(graph.conference.endsAt).toBe("2026-09-23T05:00:00.000Z");

    // 2. Session IDs and URLs, using CSV end times
    expect(graph.sessions).toHaveLength(3);
    const s921213 = graph.sessions.find((s) => s.sourceId === "921213");
    const s921465 = graph.sessions.find((s) => s.sourceId === "921465");
    const s920949 = graph.sessions.find((s) => s.sourceId === "920949");

    expect(s921213?.id).toBe("data-center-world-power-fixture-2026-09-21:session:921213");
    expect(s921213?.sourceUrl).toBe("https://agenda.example.test/session/the-future-ready-data-center-power-reliability-and-resilience-at-scale-seminar/921213");
    expect(s921213?.startsAt).toBe("2026-09-21T17:30:00.000Z");
    expect(s921213?.endsAt).toBe("2026-09-21T21:30:00.000Z");

    expect(s921465?.id).toBe("data-center-world-power-fixture-2026-09-21:session:921465");
    expect(s920949?.id).toBe("data-center-world-power-fixture-2026-09-21:session:920949");

    // 3. Speakers: 5 indexed + 7 description-only = 12 total, with Bill Kleyman deduped
    expect(graph.speakers).toHaveLength(12);

    const indexedSpeakers = graph.speakers.filter((s) => !s.id.includes(":desc:"));
    const descSpeakers = graph.speakers.filter((s) => s.id.includes(":desc:"));
    expect(indexedSpeakers).toHaveLength(5);
    expect(descSpeakers).toHaveLength(7);

    expect(graph.coverage).toEqual({
      expectedSessionPages: 2,
      fetchedSessionPages: 2,
      expectedSessions: 3,
      extractedSessions: 3,
      expectedSpeakerPages: 2,
      fetchedSpeakerPages: 2,
      expectedIndexedSpeakers: 5,
      extractedIndexedSpeakers: 5,
      structuredAgendaSpeakers: 5,
      expectedDescriptionOnlySpeakers: 7,
      descriptionOnlySpeakers: 7,
      expectedTotalSpeakers: 12,
      totalSpeakers: 12,
      expectedResearchTasks: 3,
      extractedResearchTasks: 3,
    });

    // Bill Kleyman is in description list but deduped into indexed directory speaker
    const bill = graph.speakers.find((s) => s.name === "Bill Kleyman");
    expect(bill?.id).toBe("data-center-world-power-fixture-2026-09-21:speaker:44835");
    const dado = graph.speakers.find((s) => s.name === "Dado Slezak");
    expect(dado).toMatchObject({
      id: "data-center-world-power-fixture-2026-09-21:speaker:83598",
      company: "QTS",
      email: "dado.slezak@example.com",
      phone: "+1-214-555-0184",
      linkedinUrl: "https://www.linkedin.com/in/dado-slezak",
      profileUrl: "https://agenda.example.test/speaker/slezak-dado/83598",
    });


    // 4. Stable slug IDs for description-only speakers
    const adam = graph.speakers.find((s) => s.name === "Adam Lavallee");
    expect(adam?.id).toBe("data-center-world-power-fixture-2026-09-21:speaker:desc:adam-lavallee:emerson");
    expect(adam?.company).toBe("Emerson");
    expect(adam).toMatchObject({
      email: "",
      phone: "",
      linkedinUrl: "",
      profileUrl: "",
    });

    // 5. Research tasks priority order and instructions
    expect(graph.researchTasks).toHaveLength(3);
    const taskKeynote = graph.researchTasks.find((t) => t.sessionId.endsWith(":921465"));
    const taskWorkshop = graph.researchTasks.find((t) => t.sessionId.endsWith(":921213"));
    const taskSpotlight = graph.researchTasks.find((t) => t.sessionId.endsWith(":920949"));

    expect(taskKeynote?.priority).toBe(100);
    expect(taskWorkshop?.priority).toBe(90);
    expect(taskSpotlight?.priority).toBe(70);

    for (const task of graph.researchTasks) {
      expect(task.instructions).toContain("Include exact evidence URLs. Do not infer missing details.");
    }

    // 6. Exhausted expected pagination and export URLs
    expect(fetchedUrls).toEqual([
      "https://dcwpower.com/",
      "https://agenda.example.test/",
      "https://agenda.example.test/?page=2",
      "https://agenda.example.test/src/export.php?export_schedule=true&event_id=481&feed=tensubs&export_format=csv&export_as=full_schedule&feed_url=24798bef429&default_start_time=2026-09-21T09%3A00-0500&local_timezone=CDT%3A-0500&list_view_mode=scheduled&show_these_ids=all_sessions",
      "https://agenda.example.test/speaker-filter?page=1&pageSize=25&viewMode=headshot_view&alphabet=",
      "https://agenda.example.test/speaker-filter?page=2&pageSize=25&viewMode=headshot_view&alphabet=",
    ]);
  });

  it("fails closed when mandatory CSV export fetch or parsing fails", async () => {
    const fetchMap = buildStandardFetchMap();
    fetchMap.set(
      "https://agenda.example.test/src/export.php?export_schedule=true&event_id=481&feed=tensubs&export_format=csv&export_as=full_schedule&feed_url=24798bef429&default_start_time=2026-09-21T09%3A00-0500&local_timezone=CDT%3A-0500&list_view_mode=scheduled&show_these_ids=all_sessions",
      "",
    );

    await expect(
      fetchDcwpConference({
        fetchText: async (url) => fetchMap.get(url) ?? "",
      }),
    ).rejects.toThrow(/Mandatory CSV schedule export returned empty response/);
  });

  it("fails closed when session count in cards vs CSV export mismatches", async () => {
    const fetchMap = buildStandardFetchMap();
    // Remove the last record from the CSV text cleanly
    const truncatedCsv = fullScheduleCsv.replace(/"AI Power Block: The Ultimate Solution to AI Data Center Power Bottlenecks"[^\n]*\n?/s, "").trim();
    fetchMap.set(
      "https://agenda.example.test/src/export.php?export_schedule=true&event_id=481&feed=tensubs&export_format=csv&export_as=full_schedule&feed_url=24798bef429&default_start_time=2026-09-21T09%3A00-0500&local_timezone=CDT%3A-0500&list_view_mode=scheduled&show_these_ids=all_sessions",
      truncatedCsv,
    );

    await expect(
      fetchDcwpConference({
        fetchText: async (url) => fetchMap.get(url) ?? "",
      }),
    ).rejects.toThrow(/Session count mismatch/);
  });

  it("fails closed when equal-length schedule and CSV inventories have different keys", async () => {
    const fetchMap = buildStandardFetchMap();
    const mismatchedCsv = fullScheduleCsv.replace(
      "AI Power Block: The Ultimate Solution to AI Data Center Power Bottlenecks",
      "Unexpected Replacement Session",
    );
    fetchMap.set(
      "https://agenda.example.test/src/export.php?export_schedule=true&event_id=481&feed=tensubs&export_format=csv&export_as=full_schedule&feed_url=24798bef429&default_start_time=2026-09-21T09%3A00-0500&local_timezone=CDT%3A-0500&list_view_mode=scheduled&show_these_ids=all_sessions",
      mismatchedCsv,
    );

    await expect(
      fetchDcwpConference({
        fetchText: async (url) => fetchMap.get(url) ?? "",
      }),
    ).rejects.toThrow(/Schedule session key missing from CSV export/);
  });

  it("fails closed when pagination repeats a session source ID", async () => {
    const fetchMap = buildStandardFetchMap();
    const repeatedPage = schedule2Html
      .replaceAll("920949", "921213")
      .replace("2026-09-22T11:05:00+0000", "2026-09-21T12:30:00+0000")
      .replace(
        "AI Power Block: The Ultimate Solution to AI Data Center Power Bottlenecks",
        "The Future-Ready Data Center: Power, Reliability, and Resilience at Scale Seminar",
      );
    fetchMap.set("https://agenda.example.test/?page=2", repeatedPage);

    await expect(
      fetchDcwpConference({
        fetchText: async (url) => fetchMap.get(url) ?? "",
      }),
    ).rejects.toThrow(/Duplicate schedule session source ID detected: 921213/);
  });

  it("fails closed when a published description speaker entry is malformed", async () => {
    const fetchMap = buildStandardFetchMap();
    const malformedInventory = fullScheduleCsv.replace(
      "• Adam Lavallee, Business Development Manager for Data Centers",
      "• A",
    );
    fetchMap.set(
      "https://agenda.example.test/src/export.php?export_schedule=true&event_id=481&feed=tensubs&export_format=csv&export_as=full_schedule&feed_url=24798bef429&default_start_time=2026-09-21T09%3A00-0500&local_timezone=CDT%3A-0500&list_view_mode=scheduled&show_these_ids=all_sessions",
      malformedInventory,
    );

    await expect(
      fetchDcwpConference({
        fetchText: async (url) => fetchMap.get(url) ?? "",
      }),
    ).rejects.toThrow(/Malformed description speaker entry/);
  });

  it("fails closed on reverse directory-to-agenda parity mismatch", async () => {
    const fetchMap = buildStandardFetchMap();
    const extraSpeakerDirectoryHtml = speaker1Html.replace('data-total-items="5"', 'data-total-items="6"') +
      `<div class="col-lg-3 col-md-3 sb5-session-detail-info"><div class="sb5-session-detail-info"><div class="sb5-speakers-page-speaker"><a href="/speaker/orphan-person/998877">Orphan Person</a></div></div></div>`;
    fetchMap.set("https://agenda.example.test/speaker-filter?page=1&pageSize=25&viewMode=headshot_view&alphabet=", extraSpeakerDirectoryHtml);

    await expect(
      fetchDcwpConference({
        fetchText: async (url) => fetchMap.get(url) ?? "",
      }),
    ).rejects.toThrow(/Reconciliation failure: directory speaker ID 998877 missing from structured agenda/);
  });
});
