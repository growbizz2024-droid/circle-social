import { test, expect } from "@playwright/test";
const complete = {
  id: "23a10d5a-e363-45ee-a050-8a1d83debe2f",
  handle: "quiet_otter_4821",
  displayName: null,
  bio: null,
  avatarId: "otter",
  profileTheme: "DARK",
  profileAccent: "AMBER",
  profileVersion: 0,
  onboarding: null,
  onboardingCompletedAt: "2026-11-01T00:00:00.000Z",
};
for (const expired of [true, false]) {
  test(
    expired
      ? "expired feed session returns to sign-in without retries"
      : "incomplete account returns to recovery instead of retrying forbidden feed",
    async ({ page }) => {
      let profileReads = 0,
        feedReads = 0;
      await page.route("**/api/v1/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === "/api/v1/users/me") {
          profileReads++;
          if (feedReads === 0)
            return route.fulfill({ json: { data: complete } });
          return expired
            ? route.fulfill({
                status: 401,
                json: { error: { code: "HTTP_401" } },
              })
            : route.fulfill({
                json: { data: { ...complete, onboardingCompletedAt: null } },
              });
        }
        if (path === "/api/v1/feed") {
          feedReads++;
          return route.fulfill({
            status: expired ? 401 : 403,
            json: { error: { code: expired ? "HTTP_401" : "HTTP_403" } },
          });
        }
        if (path === "/api/v1/activity")
          return route.fulfill({
            status: 403,
            json: { error: { code: "HTTP_403" } },
          });
        if (path === "/api/v1/communities")
          return route.fulfill({ json: { data: { items: [] } } });
        if (path === "/api/v1/auth/recovery/status")
          return route.fulfill({
            json: { data: { confirmed: false, expiresAt: null } },
          });
        return route.fulfill({
          status: 404,
          json: { error: { code: "HTTP_404" } },
        });
      });
      await page.goto("/");
      await expect(
        page.getByRole("heading", {
          name: expired ? "Welcome back." : "Save your recovery credential.",
          exact: true,
        }),
      ).toBeVisible();
      expect(profileReads).toBeGreaterThanOrEqual(2);
      expect(feedReads).toBe(1);
      await expect(page.getByRole("main", { name: "Home feed" })).toHaveCount(
        0,
      );
    },
  );
}

test("Profile to Home rechecks completion before requesting the feed", async ({
  page,
}) => {
  let pending = false,
    forbiddenFeedRequests = 0;
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/users/me")
      return route.fulfill({
        json: {
          data: {
            ...complete,
            onboardingCompletedAt: pending
              ? null
              : complete.onboardingCompletedAt,
          },
        },
      });
    if (path === "/api/v1/feed") {
      if (pending) forbiddenFeedRequests++;
      return route.fulfill({
        json: { data: { items: [], communities: [], interests: [] } },
      });
    }
    if (path === "/api/v1/activity")
      return route.fulfill({ json: { data: { items: [], unreadCount: 0 } } });
    if (path === "/api/v1/communities")
      return route.fulfill({ json: { data: { items: [] } } });
    if (path === "/api/v1/auth/recovery/status")
      return route.fulfill({
        json: { data: { confirmed: false, expiresAt: null } },
      });
    if (["/api/v1/auth/sessions", "/api/v1/auth/passkeys"].includes(path))
      return route.fulfill({ json: { data: [] } });
    return route.fulfill({
      status: 404,
      json: { error: { code: "HTTP_404" } },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Your profile", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Make it yours", exact: true }),
  ).toBeVisible();
  pending = true;
  await page.getByRole("button", { name: "Home feed", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Save your recovery credential.",
      exact: true,
    }),
  ).toBeVisible();
  expect(forbiddenFeedRequests).toBe(0);
});
