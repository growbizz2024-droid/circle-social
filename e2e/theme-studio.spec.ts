import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { generateAvatar } from "../packages/avatar-engine/dist/index.js";
import type { AppliedTheme, SavedTheme } from "@circle/shared-types";
test("theme studio keeps a live preview visible and applies account themes across the UI", async ({
  page,
}) => {
  const profile = {
    id: randomUUID(),
    handle: "quiet_otter_4821",
    displayName: null,
    bio: null,
    avatarId: "otter",
    avatar: generateAvatar("theme-preview"),
    profileTheme: "DARK",
    profileAccent: "AMBER",
    profileVersion: 0,
    onboarding: null,
    onboardingCompletedAt: "2026-11-01T00:00:00.000Z",
    activeTheme: null as AppliedTheme | null,
    themeVersion: 0,
  };
  const themes: SavedTheme[] = [];
  let background = "ember";
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname.replace("/api/v1/", ""),
      method = req.method(),
      body = req.postDataJSON();
    let data: unknown = [];
    if (path === "users/me") data = profile;
    else if (path === "themes" && method === "GET")
      data = { items: themes, bytesUsed: 1024, byteLimit: 2097152 };
    else if (path === "themes" && method === "POST") {
      const item = {
        ...body,
        id: randomUUID(),
        revision: 0,
        supported: true,
        updatedAt: new Date().toISOString(),
      };
      themes.push(item);
      data = item;
    } else if (path === "themes/state")
      data = {
        activeTheme: profile.activeTheme,
        themeVersion: profile.themeVersion,
        defaultBackgroundId: background,
      };
    else if (path === "themes/default") {
      profile.activeTheme = null;
      profile.themeVersion++;
      background = body.backgroundId;
      data = {
        activeTheme: null,
        themeVersion: profile.themeVersion,
        defaultBackgroundId: background,
      };
    } else if (/^themes\/[^/]+\/apply$/.test(path)) {
      const item = themes.find((x) => x.id === path.split("/")[1])!;
      profile.activeTheme = {
        id: item.id,
        name: item.name,
        revision: item.revision,
        config: item.config,
      };
      profile.themeVersion++;
      data = {
        activeTheme: profile.activeTheme,
        themeVersion: profile.themeVersion,
        defaultBackgroundId: background,
      };
    } else if (/^themes\/[^/]+\/duplicate$/.test(path)) {
      const source = themes.find((x) => x.id === path.split("/")[1])!;
      const item = {
        ...source,
        id: randomUUID(),
        name: source.name + " copy",
        revision: 0,
      };
      themes.push(item);
      data = item;
    } else if (path.startsWith("themes/") && method === "PATCH") {
      const item = themes.find((x) => x.id === path.split("/")[1])!;
      Object.assign(item, body, { revision: item.revision + 1 });
      data = item;
    } else if (path.startsWith("themes/") && method === "DELETE") {
      const index = themes.findIndex((x) => x.id === path.split("/")[1]);
      const [item] = themes.splice(index, 1);
      data = { id: item.id, revision: item.revision + 1 };
    } else if (path === "feed")
      data = { items: [], communities: [], interests: [] };
    else if (path === "activity") data = { items: [], unreadCount: 0 };
    else if (path === "communities") data = { items: [] };
    else if (path === "avatars/me")
      data = {
        ...profile.avatar,
        revision: 0,
        defaultSeed: profile.avatar.seed,
      };
    await route.fulfill({ json: { data } });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Your profile", exact: true }).click();
  await page
    .getByRole("button", { name: "＋ Create Your Own Theme", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Custom App Theme Studio" }),
    preview = dialog.getByRole("region", { name: "Live theme preview" });
  await expect(dialog).toBeVisible();
  await expect(preview).toBeInViewport();
  await dialog.getByRole("button", { name: "Colors", exact: true }).click();
  await dialog.getByRole("button", { name: "Warm Paper", exact: true }).click();
  await dialog.getByLabel("Theme name", { exact: true }).fill("My Warm Circle");
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-custom-theme",
    "true",
  );
  await expect(
    dialog.getByRole("button", { name: "Save theme", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: "artifacts/theme-studio-desktop.png",
    style: "nextjs-portal{visibility:hidden}",
  });
  await page.setViewportSize({ width: 390, height: 680 });
  const before = await preview.boundingBox();
  await dialog.getByRole("button", { name: "Effects", exact: true }).click();
  await dialog.getByLabel("Corner radius", { exact: true }).fill("24");
  await expect(preview).toBeInViewport();
  expect((await preview.boundingBox())!.y).toBeCloseTo(before!.y, 0);
  await expect(
    dialog.getByRole("button", { name: "Save & apply theme", exact: true }),
  ).toBeInViewport();
  await page.screenshot({
    path: "artifacts/theme-studio-mobile.png",
    style: "nextjs-portal{visibility:hidden}",
  });
  await dialog.getByRole("button", { name: "Save theme", exact: true }).click();
  await expect(dialog.locator("p[role=status]")).toHaveText(
    "Theme saved. Apply it when you’re ready.",
  );
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-custom-theme",
    "true",
  );
  await dialog
    .getByRole("button", { name: "Save & apply theme", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-custom-theme",
    "true",
  );
  await expect
    .poll(() =>
      page
        .locator("html")
        .evaluate((el) =>
          getComputedStyle(el).getPropertyValue("--theme-main"),
        ),
    )
    .toBe("#FFF7ED");
  await dialog
    .getByRole("button", { name: "Close studio", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByText("My Warm Circle · Active", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-custom-theme",
    "true",
  );
  await page.getByRole("button", { name: "Your profile", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await dialog.getByRole("button", { name: "Colors", exact: true }).click();
  await dialog.getByLabel("Primary text HEX", { exact: true }).fill("#FFFFFF");
  await expect(
    dialog.getByRole("button", { name: "Save theme", exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByText("Improve readability before saving"),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Save theme", exact: true }),
  ).toBeEnabled();
  await dialog
    .getByRole("button", { name: "Close studio", exact: true })
    .click();
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(
    page.getByText("My Warm Circle copy", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ember", exact: true }).click();
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-custom-theme",
    "true",
  );
});
