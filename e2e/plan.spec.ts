import { expect, test } from "@playwright/test";

// Planning decisions persist by design, so the run starts from a known state.
const SPEAKER_ID = "demo-speaker-4";
const SPEAKER_NAME = "Elliot Park";
const OFFSETS = [-14, -7, -2, 0, 2];

/**
 * The human workflow end to end: say you are going, save someone to meet, note
 * what to discuss, approve one drafted email, and see all of it on the plan.
 */
test("records attendance, a meet list, a talking point, and a draft approval", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Load demo conference" }).click();
  await expect(page).toHaveURL(/\/conferences\//);

  for (const offset of OFFSETS) {
    await request.post("/api/plan", {
      data: {
        action: "approval",
        stepId: `${SPEAKER_ID}:${offset}`,
        speakerId: SPEAKER_ID,
        status: "pending",
      },
    });
  }
  await page.reload();

  await page.getByRole("button", { name: "Going in person" }).click();
  await expect(page.getByRole("button", { name: "Going in person" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const addToList = page.getByRole("button", { name: `Add ${SPEAKER_NAME} to your meet list` });
  if (await addToList.count()) await addToList.click();
  await expect(
    page.getByRole("button", { name: `Remove ${SPEAKER_NAME} from your meet list` }),
  ).toBeVisible();

  await page.getByRole("link", { name: `View ${SPEAKER_NAME}` }).click();
  await expect(page.getByText("ON YOUR MEET LIST")).toBeVisible();

  const note = page.getByLabel("What do you want to discuss?");
  await note.click();
  await note.fill("Ask how they are powering the Houston campus.");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  // Nothing is sendable until a person approves it.
  await expect(page.getByText("WAITING FOR APPROVAL")).toHaveCount(OFFSETS.length);
  await page.getByRole("button", { name: "Approve" }).first().click();
  await expect(page.getByText("APPROVED TO SEND")).toHaveCount(1);
  await expect(page.getByText("DRAFTS ONLY · NEVER SENT")).toBeVisible();

  await page.getByRole("link", { name: "My plan" }).click();
  // Other people may already be saved, so pin the assertion to this speaker.
  await expect(
    page.getByTestId("plan-person").filter({ hasText: SPEAKER_NAME }),
  ).toContainText("Ask how they are powering the Houston campus.");
  await expect(page.getByTestId("plan-draft").first()).toBeVisible();
});
