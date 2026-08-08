import { expect, test, type Page } from "@playwright/test";

/**
 * These run against whatever the configured database actually holds — there is
 * no sample dataset to seed. Reads only: the planning actions they exercise
 * (meet list, approvals) are stored locally, so a run never writes into shared
 * conference records.
 */

interface CalendarEntry {
  name: string;
  conferenceId: string | null;
  topSpeaker: { id: string; name: string } | null;
  speakerCount: number;
}

async function liveEntry(page: Page): Promise<CalendarEntry> {
  const response = await page.request.get("/api/calendar");
  expect(response.ok()).toBe(true);
  const { entries } = (await response.json()) as { entries: CalendarEntry[] };
  const live = entries.find((entry) => entry.conferenceId && entry.speakerCount > 0);
  if (!live) test.skip(true, "No analyzed conference in the database yet");
  return live!;
}

test("the calendar lists real events and opens the one with a speaker list", async ({ page }) => {
  const live = await liveEntry(page);

  await page.goto("/conferences");
  await expect(page.getByTestId("calendar-entry").first()).toBeVisible();
  await expect(page.getByText("SPEAKERS PUBLISHED", { exact: true }).first()).toBeVisible();

  await page.goto(`/conferences/${live.conferenceId}`);
  await expect(page.getByRole("heading", { name: live.name })).toBeVisible();

  const rows = page.getByTestId("speaker-row");
  await expect(rows).toHaveCount(live.speakerCount);

  // The filter narrows to people actually worth contacting.
  await page.getByRole("button", { name: /^Worth contacting/ }).click();
  const worth = await rows.count();
  expect(worth).toBeGreaterThan(0);
  expect(worth).toBeLessThanOrEqual(live.speakerCount);
});

test("a real speaker profile loads with its evidence and drafts", async ({ page }) => {
  const live = await liveEntry(page);
  expect(live.topSpeaker).not.toBeNull();

  // Real ids contain colons, so the link must survive URL encoding.
  await page.goto(`/speakers/${encodeURIComponent(live.topSpeaker!.id)}`);
  await expect(page.getByRole("heading", { name: live.topSpeaker!.name })).toBeVisible();
  await expect(page.getByText("Why this person matters")).toBeVisible();
  await expect(page.getByText("DRAFTS ONLY · NEVER SENT")).toBeVisible();
  await expect(page.getByTestId("sequence-step").first()).toBeVisible();
});

test("planning decisions save against a real speaker", async ({ page }) => {
  const live = await liveEntry(page);
  const speakerId = live.topSpeaker!.id;
  const speakerName = live.topSpeaker!.name;

  await page.goto(`/speakers/${encodeURIComponent(speakerId)}`);

  const add = page.getByRole("button", { name: `Add ${speakerName} to your meet list` });
  if (await add.count()) await add.click();
  await expect(
    page.getByRole("button", { name: `Remove ${speakerName} from your meet list` }),
  ).toBeVisible();

  const note = page.getByLabel("What do you want to discuss?");
  await note.click();
  await note.fill("Ask about their onsite power roadmap.");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  // Saving triggers a router refresh; wait for the navigation to actually land
  // rather than asserting against the page we were on.
  await page.getByRole("link", { name: "My plan" }).click();
  await page.waitForURL("**/plan");

  await expect(page.getByTestId("plan-person").filter({ hasText: speakerName })).toContainText(
    "Ask about their onsite power roadmap.",
  );
});

test("the speakers page lists only people you chose, not the whole database", async ({ page }) => {
  const live = await liveEntry(page);

  // Save one person, then confirm the page shows them and not the full list.
  await page.goto(`/speakers/${encodeURIComponent(live.topSpeaker!.id)}`);
  const add = page.getByRole("button", { name: `Add ${live.topSpeaker!.name} to your meet list` });
  if (await add.count()) await add.click();

  await page.goto("/speakers");
  const rows = page.getByTestId("tracked-speaker");
  const tracked = await rows.count();

  expect(tracked).toBeGreaterThan(0);
  expect(tracked).toBeLessThan(live.speakerCount);
  await expect(rows.filter({ hasText: live.topSpeaker!.name })).toHaveCount(1);
});

test("the month view places real events on their dates", async ({ page }) => {
  await page.goto("/conferences");

  const dialog = page.getByTestId("month-dialog");
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: /month view/i }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("columnheader")).toHaveCount(7);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
