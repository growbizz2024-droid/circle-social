import { test, expect } from "@playwright/test";
import { generateAvatar } from "../packages/avatar-engine/dist/index.js";
test("avatar preview and actions stay visible while choosing lower options", async ({
  page,
}) => {
  const avatar = generateAvatar("fixed-preview-regression");
  const profile = {
    id: "23a10d5a-e363-45ee-a050-8a1d83debe2f",
    handle: "quiet_otter_4821",
    displayName: null,
    bio: null,
    avatarId: "otter",
    avatar,
    profileTheme: "DARK",
    profileAccent: "AMBER",
    profileVersion: 0,
    onboarding: null,
    onboardingCompletedAt: "2026-11-01T00:00:00.000Z",
  };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data =
      path === "/api/v1/users/me"
        ? profile
        : path === "/api/v1/avatars/me"
          ? { ...avatar, defaultSeed: avatar.seed, revision: 0 }
          : path === "/api/v1/feed"
            ? { items: [], communities: [], interests: [] }
            : path === "/api/v1/activity"
              ? { items: [], unreadCount: 0 }
              : path === "/api/v1/communities"
                ? { items: [] }
                : [];
    await route.fulfill({ json: { data } });
  });
  await page.setViewportSize({ width: 390, height: 680 });
  await page.goto("/");
  await page.getByRole("button", { name: "Your profile", exact: true }).click();
  await page
    .getByRole("button", { name: "Customize avatar", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
      name: "Avatar customization",
      exact: true,
    }),
    preview = dialog.getByAltText("Avatar preview", { exact: true });
  await expect(dialog).toBeVisible();
  const before = await preview.boundingBox();
  const options = dialog.getByRole("region", {
    name: "Avatar options",
    exact: true,
  });
  await options.focus();
  await options.press("End");
  await expect
    .poll(() => options.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);

  await dialog
    .getByLabel("Background", { exact: true })
    .selectOption("orbital-abstract");
  const after = await preview.boundingBox();
  expect(after!.y).toBeCloseTo(before!.y, 0);
  await expect(preview).toBeInViewport();
  await expect(
    dialog.getByRole("button", { name: "Save avatar", exact: true }),
  ).toBeInViewport();
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeInViewport();
  expect(
    await dialog
      .getByRole("region", { name: "Avatar options", exact: true })
      .evaluate((el) => el.scrollTop),
  ).toBeGreaterThan(0);
  await page.screenshot({
    path: "artifacts/avatar-editor-fixed-preview.png",
    fullPage: false,
    style: "nextjs-portal{visibility:hidden}",
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(preview).toBeInViewport();
  await dialog.getByLabel("Hair color", { exact: true }).selectOption("copper");
  await expect(preview).toBeInViewport();
  await page.screenshot({
    path: "artifacts/avatar-editor-fixed-preview-desktop.png",
    fullPage: false,
    style: "nextjs-portal{visibility:hidden}",
  });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).not.toBeVisible();
});
