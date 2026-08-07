import { expect, test } from "@playwright/test";

test("loads demo data and reaches ranked speaker, sequence, and funnel", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Load demo conference" }).click();
  await expect(page.getByText("DEMO DATA")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gulf Coast Power & AI Forum 2026" })).toBeVisible();

  await page.getByRole("link", { name: "View Maya Torres" }).click();
  await expect(page.getByText("Why now?", { exact: false })).toBeVisible();
  await expect(page.getByTestId("sequence-step")).toHaveCount(5);
  await expect(page.getByText("DRAFTS ONLY · NEVER SENT")).toBeVisible();

  await page.getByRole("link", { name: "Funnel" }).click();
  await expect(page.getByTestId("funnel-stage")).toHaveCount(8);
  await expect(page.getByText("Conversation booked")).toBeVisible();
});
