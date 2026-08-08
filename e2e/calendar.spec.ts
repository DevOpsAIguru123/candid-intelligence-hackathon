import { expect, test } from "@playwright/test";

import { CONFERENCE_SERIES } from "../data/conference-series";

test("watches every event, opens one that has no speaker list, and works the one that does", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Load demo conference" }).click();
  await expect(page).toHaveURL(/\/conferences\//);

  await page.getByRole("link", { name: "Calendar" }).click();
  await expect(page.getByTestId("calendar-entry")).toHaveCount(CONFERENCE_SERIES.length + 1);
  await expect(page.getByText("SPEAKERS PUBLISHED", { exact: true })).toBeVisible();
  await expect(page.getByText("dates confirmed")).toBeVisible();
  await expect(page.getByText("dates expected").first()).toBeVisible();

  // A watched event with no speaker list still has a page of its own.
  await page.getByRole("link", { name: "CERAWeek" }).click();
  await expect(page).toHaveURL(/\/calendar\/ceraweek$/);
  await expect(page.getByRole("heading", { name: "No speaker list yet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Read the speaker list now" })).toBeVisible();

  // An analyzed event opens into the speaker workspace, which filters and searches.
  await page.goto("/calendar");
  await page.getByRole("link", { name: "See speakers" }).first().click();
  const rows = page.getByTestId("speaker-row");
  await expect(rows).toHaveCount(8);

  await page.getByRole("button", { name: /^Worth contacting/ }).click();
  await expect(rows).toHaveCount(7);

  await page.getByPlaceholder("Search name, company, or talk").fill("Vertex");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Maya Torres");
});

test("opens a month grid popup that places events on their real dates", async ({ page }) => {
  await page.goto("/calendar");

  const dialog = page.getByTestId("month-dialog");
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: /month view/i }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("columnheader")).toHaveCount(7);

  await dialog.getByRole("button", { name: "Next event" }).click();
  await expect(dialog.getByTestId("month-day-with-event").first()).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
