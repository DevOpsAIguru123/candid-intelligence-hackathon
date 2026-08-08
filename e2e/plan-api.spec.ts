import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Regression: QA-001 — the planning API stored references to speakers and
 * conferences that do not exist. Those rows rendered no row anyone could
 * remove, but still counted, so "On your meet list" disagreed with the list.
 * Found by /qa on 2026-08-08.
 * Report: .gstack/qa-reports/qa-report-speaker-signal-2026-08-08.md
 */

interface Entry {
  conferenceId: string | null;
  speakerCount: number;
  topSpeaker: { id: string } | null;
}

async function liveRecords(request: APIRequestContext) {
  const { entries } = (await (await request.get("/api/calendar")).json()) as { entries: Entry[] };
  const live = entries.find((entry) => entry.conferenceId && entry.speakerCount > 0);
  if (!live) test.skip(true, "No analyzed conference in the database yet");
  return { conferenceId: live!.conferenceId!, speakerId: live!.topSpeaker!.id };
}

test("the planning API refuses references to records that do not exist", async ({ request }) => {
  const { conferenceId } = await liveRecords(request);

  const cases = [
    { action: "meet-add", speakerId: "ghost-speaker", conferenceId },
    { action: "attendance", conferenceId: "ghost-conference", status: "attending" },
    { action: "approval", stepId: "ghost:step", speakerId: "ghost-speaker", status: "approved" },
    { action: "meet-note", speakerId: "ghost-speaker", note: "should not stick" },
  ];

  for (const data of cases) {
    const response = await request.post("/api/plan", { data });
    expect(response.status(), `${data.action} should be rejected`).toBe(422);
    expect((await response.json()).success).toBe(false);
  }
});

test("the planning API still accepts real records", async ({ request }) => {
  const { conferenceId, speakerId } = await liveRecords(request);

  for (const data of [
    { action: "meet-add", speakerId, conferenceId },
    { action: "meet-note", speakerId, note: "Regression check" },
    { action: "attendance", conferenceId, status: "attending" },
    { action: "approval", stepId: `${speakerId}:-14`, speakerId, status: "pending" },
  ]) {
    const response = await request.post("/api/plan", { data });
    expect(response.ok(), `${data.action} should succeed`).toBe(true);
  }
});

test("the meet-list count never exceeds the rows it can show", async ({ page }) => {
  await page.goto("/speakers");

  const metric = page.locator(".metric-card", { hasText: "On your meet list" });
  const shown = Number((await metric.innerText()).match(/(\d+)/)![1]);
  const rows = await page.getByTestId("tracked-speaker").count();

  expect(shown).toBeLessThanOrEqual(rows);
});
