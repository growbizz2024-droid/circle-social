import { test, expect } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
test.beforeEach(() => {
  execFileSync(
    "pnpm",
    ["--filter", "api", "exec", "node", "scripts/reset-e2e-limits.mjs"],
    { stdio: "pipe" },
  );
});

test("passkey signup, profile, conflicts, mobile handoff, login and deactivation", async ({
  page,
  context,
  request,
}) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send(
    "WebAuthn.addVirtualAuthenticator",
    {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    },
  );
  let identity: { id: string; handle: string } | undefined;
  try {
    await page.goto("/");
    let registrations = 0;
    page.on("request", (request) => {
      if (request.url().includes("/auth/registration/")) registrations++;
    });
    await expect(
      page.getByRole("button", { name: "Get Started", exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await page.evaluate(() => document.fonts.ready);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({
      path: "artifacts/onboarding-welcome-desktop.png",
      fullPage: true,
      style: "nextjs-portal{visibility:hidden}",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "artifacts/onboarding-welcome-mobile.png",
      fullPage: true,
      style: "nextjs-portal{visibility:hidden}",
    });
    await page
      .getByRole("button", { name: "Get Started", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "What’s your gender?" }),
    ).toBeVisible();
    await page.getByRole("radio", { name: /Prefer not to say/ }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("radio", { name: /Calm/ }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("radio", { name: "Alpine", exact: true }).click();
    await page.screenshot({
      path: "artifacts/onboarding-backgrounds.png",
      fullPage: true,
      style: "nextjs-portal{visibility:hidden}",
    });
    await page.reload();
    await expect(
      page.getByRole("radio", { name: "Alpine", exact: true }),
    ).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Looking good!" }),
    ).toBeVisible();
    await page.screenshot({
      path: "artifacts/onboarding-preview.png",
      fullPage: true,
      style: "nextjs-portal{visibility:hidden}",
    });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const chosenHandle = await page
      .getByLabel("Username", { exact: true })
      .inputValue();
    expect(chosenHandle).toMatch(/^[a-z]+_[a-z]+_\d{4}$/);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page
        .getByRole("dialog", { name: "Avatar customization", exact: true })
        .getByRole("heading", {
          name: "Make your avatar yours.",
          exact: true,
        }),
    ).toBeVisible();
    const firstAvatar = await page
      .getByAltText("Avatar preview", { exact: true })
      .getAttribute("src");
    await page
      .getByRole("button", { name: "Generate Again", exact: true })
      .click();
    await expect(
      page.getByAltText("Avatar preview", { exact: true }),
    ).not.toHaveAttribute("src", firstAvatar!);
    await page
      .getByLabel("Avatar style", { exact: true })
      .selectOption("faceless");
    await page.getByLabel("Skin tone", { exact: true }).selectOption("cocoa");
    await page
      .getByLabel("Accessories", { exact: true })
      .selectOption("headphones");
    await page.screenshot({
      path: "artifacts/avatar-onboarding-mobile.png",
      fullPage: false,
      style: "nextjs-portal{visibility:hidden}",
    });
    await page
      .getByRole("button", { name: "Save avatar", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Set up your passkey." }),
    ).toBeVisible();
    expect(registrations).toBe(0);
    expect((await page.request.get("/api/v1/users/me")).status()).toBe(401);
    await page.screenshot({
      path: "artifacts/onboarding-passkey-after-username.png",
      fullPage: true,
      style: "nextjs-portal{visibility:hidden}",
    });
    await page
      .getByRole("button", { name: "Set up passkey", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Save your recovery credential." }),
    ).toBeVisible();
    const registered = (
      await (await page.request.get("/api/v1/users/me")).json()
    ).data;
    identity = { id: registered.id, handle: registered.handle };
    expect(registered.onboardingCompletedAt).toBeNull();
    expect(registered.onboarding).toBeNull();
    await page.request.post("/api/v1/auth/logout", {
      headers: { Origin: "http://localhost:3200" },
      data: {},
    });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Welcome back." }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Continue with Passkey", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Save your recovery credential." }),
    ).toBeVisible();
    expect(
      (await (await page.request.get("/api/v1/users/me")).json()).data.id,
    ).toBe(registered.id);

    // A stale client completion marker cannot bypass server-side onboarding.
    await page.evaluate(() => {
      const key = "circle.onboarding.v1",
        draft = JSON.parse(sessionStorage.getItem(key)!);
      sessionStorage.setItem(
        key,
        JSON.stringify({ ...draft, step: "complete", readyToFinish: true }),
      );
    });
    let prematureFeedRequests = 0;
    const watchFeed = (request: import("@playwright/test").Request) => {
      if (request.url().includes("/api/v1/feed")) prematureFeedRequests++;
    };
    page.on("request", watchFeed);
    await page.reload();
    await expect(
      page.getByRole("heading", {
        name: "Save your recovery credential.",
        exact: true,
      }),
    ).toBeVisible();
    expect(prematureFeedRequests).toBe(0);
    page.off("request", watchFeed);
    expect((await page.request.get("/api/v1/feed")).status()).toBe(403);
    await page
      .getByRole("button", {
        name: "Generate recovery credential",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Confirm saved credential",
        exact: true,
      }),
    ).toBeDisabled();
    const savedRecovery = await page.locator(".recovery-secret").textContent();
    expect(savedRecovery).toMatch(/^CS1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download credential", exact: true })
      .click();
    expect((await download).suggestedFilename()).toBe(
      "circle-social-recovery.txt",
    );
    await page
      .getByRole("checkbox", {
        name: "I have saved my recovery credential securely",
      })
      .check();
    await page
      .getByRole("button", { name: "Confirm saved credential", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Credential confirmed", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Choose your interests." }),
    ).toBeVisible();
    expect(await page.locator(".recovery-secret").count()).toBe(0);
    expect(
      await page.evaluate(() => sessionStorage.getItem("circle.onboarding.v1")),
    ).not.toContain(savedRecovery);

    await page.getByRole("button", { name: "Technology", exact: true }).click();
    await page.getByRole("button", { name: "Food", exact: true }).click();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Choose your interests." }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Technology", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Find your communities." }),
    ).toBeVisible();
    await expect(page.locator(".community-choice")).toHaveCount(5);
    await page.getByRole("button", { name: /^Bhasar/ }).click();
    await page.getByRole("button", { name: /^Khushi Ki Pujari/ }).click();
    await expect(page.locator(".community-choice-cover")).toHaveCount(5);
    await page
      .locator(".community-choice-cover")
      .evaluateAll(async (images) => {
        await Promise.all(
          images.map((image) => {
            const img = image as HTMLImageElement;
            img.loading = "eager";
            return img.decode();
          }),
        );
      });
    await page.screenshot({
      path: "artifacts/onboarding-communities.png",
      fullPage: true,
      style: "nextjs-portal{visibility:hidden}",
    });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "This is your Circle." }),
    ).toBeVisible();
    await expect(page.locator(".review-card")).toContainText(chosenHandle);
    await expect(page.locator(".review-card")).toContainText("Bhasar");
    await page.screenshot({
      path: "artifacts/onboarding-final-review.png",
      fullPage: true,
      style: "nextjs-portal{visibility:hidden}",
    });
    await page
      .getByRole("button", { name: "Complete registration", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "You’re one of us now." }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Explore Circle.social", exact: true })
      .click();
    await expect(page.getByRole("main", { name: "Home feed" })).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Personalized feed" }),
    ).toContainText("Your circle starts here.");
    await expect(
      page.getByRole("button", { name: "Communities", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: "artifacts/onboarding-home-feed.png",
      fullPage: true,
      style: "nextjs-portal{visibility:hidden}",
    });
    await page
      .getByRole("button", { name: "Create post", exact: true })
      .click();
    await page.getByRole("button", { name: /^Image/ }).click();
    await page
      .getByRole("textbox", { name: "Post text", exact: true })
      .fill(
        "Some days are just better with good people and great conversations. 🧡",
      );
    await page
      .getByLabel("Choose post images", { exact: true })
      .setInputFiles("assets/communities/bhasar.jpg");
    await expect(
      page.getByAltText("Selected photo", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Technology", exact: true }).click();
    await page.getByRole("button", { name: "Post", exact: true }).click();
    const card = page
      .getByRole("article")
      .filter({ hasText: "Some days are just better" })
      .first();
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: /^Like post/ }).click();
    await expect(
      card.getByRole("button", { name: /^Unlike post/ }),
    ).toHaveAttribute("aria-pressed", "true");
    await card.getByRole("button", { name: /^Save post/ }).click();
    await card.getByRole("button", { name: /^Comments on post/ }).click();
    await page
      .getByLabel("Your comment", { exact: true })
      .fill("A little more connection, every day.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(
      page.getByText("A little more connection, every day.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close Post", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "artifacts/feed-mobile.png",
      fullPage: true,
      style: "nextjs-portal{visibility:hidden}",
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({
      path: "artifacts/feed-desktop.png",
      fullPage: true,
      style: "nextjs-portal{visibility:hidden}",
    });
    await page.getByRole("button", { name: "Discover", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Trending Topics", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /#Technology/ }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "People", exact: true }).click();
    await page.getByRole("tab", { name: "Communities", exact: true }).click();
    await page
      .getByRole("button", { name: "Open Bhasar", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Bhasar", exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "About", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "About Bhasar", exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Latest", exact: true }).click();
    await page.screenshot({
      path: "artifacts/community-detail.png",
      fullPage: true,
      style: "nextjs-portal{visibility:hidden}",
    });
    await page
      .getByRole("button", { name: "Create post", exact: true })
      .click();
    await page.getByRole("button", { name: /^Audio/ }).click();

    await context.grantPermissions(["microphone"]);
    await page
      .getByRole("button", { name: "Start recording", exact: true })
      .click();
    await expect(page.getByRole("timer")).toContainText("0:02", {
      timeout: 6000,
    });
    await page
      .getByRole("button", { name: "Pause recording", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Resume recording", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Stop recording", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Save recording", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Post", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("textbox", { name: "Post text", exact: true })
      .fill("A voice from our circle.");
    await page.getByRole("button", { name: "Post", exact: true }).click();
    const voice = page
      .getByRole("article")
      .filter({ hasText: "A voice from our circle." })
      .first();
    await expect(voice).toBeVisible();
    await expect(voice.locator("audio")).toBeVisible();
    await voice.locator("audio").evaluate(async (audio: HTMLAudioElement) => {
      await audio.play();
      audio.pause();
    });
    execFileSync(
      "pnpm",
      ["--filter", "api", "exec", "node", "scripts/reset-e2e-limits.mjs"],
      { stdio: "pipe" },
    );
    await page
      .getByRole("button", { name: "Your profile", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Make it yours" }),
    ).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });
    const profile = (await (await page.request.get("/api/v1/users/me")).json())
      .data;
    identity = { id: profile.id, handle: profile.handle };
    expect(/^[a-z]+_[a-z]+_\d{4}$/.test(profile.handle)).toBe(true);
    expect(profile.handle).toBe(chosenHandle);
    expect(profile.onboarding).toEqual({
      gender: "PREFER_NOT_TO_SAY",
      vibe: "CALM",
      backgroundId: "alpine",
      interests: ["technology", "food"],
    });
    expect(profile.onboardingCompletedAt).toBeTruthy();

    // Real account Theme Studio: preview is local, Apply persists, defaults restore.
    await page
      .getByRole("button", { name: "＋ Create Your Own Theme", exact: true })
      .click();
    const themeStudio = page.getByRole("dialog", {
      name: "Custom App Theme Studio",
    });
    await themeStudio
      .getByRole("button", { name: "Colors", exact: true })
      .click();
    await themeStudio
      .getByRole("button", { name: "Quiet Teal", exact: true })
      .click();
    await themeStudio
      .getByLabel("Theme name", { exact: true })
      .fill("Protocol-tested Circle");
    await themeStudio
      .getByRole("button", { name: "Save theme", exact: true })
      .click();
    await expect(themeStudio.locator("p[role=status]")).toHaveText(
      "Theme saved. Apply it when you’re ready.",
    );
    await expect(page.locator("html")).not.toHaveAttribute(
      "data-custom-theme",
      "true",
    );
    await themeStudio
      .getByRole("button", { name: "Save & apply theme", exact: true })
      .click();
    await expect(themeStudio.locator("p[role=status]")).toHaveText(
      "Theme saved and applied across your app.",
    );
    await expect(page.locator("html")).toHaveAttribute(
      "data-custom-theme",
      "true",
    );
    expect(
      (await (await page.request.get("/api/v1/users/me")).json()).data
        .activeTheme.name,
    ).toBe("Protocol-tested Circle");
    await themeStudio
      .getByRole("button", { name: "Close studio", exact: true })
      .click();
    await page.getByRole("button", { name: "Alpine", exact: true }).click();
    await expect(page.locator("html")).not.toHaveAttribute(
      "data-custom-theme",
      "true",
    );

    await expect(page.locator(".session-location").first()).toHaveText(
      "Location unavailable",
    );
    await expect(
      page.getByRole("link", { name: "IP Geolocation by DB-IP", exact: true }),
    ).toHaveAttribute("href", "https://db-ip.com");
    await page.getByLabel("Display name").fill("A quiet voice");
    const originalAvatar = (
      await (await page.request.get("/api/v1/avatars/me")).json()
    ).data;
    await page
      .getByRole("button", { name: "Customize avatar", exact: true })
      .click();
    await page.getByLabel("Hair color", { exact: true }).selectOption("silver");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(
      (await (await page.request.get("/api/v1/avatars/me")).json()).data,
    ).toEqual(originalAvatar);
    await page
      .getByRole("button", { name: "Customize avatar", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Reset avatar", exact: true })
      .click();
    await page
      .getByLabel("Avatar style", { exact: true })
      .selectOption("expressive");
    await page
      .getByLabel("Accessories", { exact: true })
      .selectOption("round-glasses");
    await page.getByLabel("Outfit", { exact: true }).selectOption("blazer");
    await page
      .getByRole("button", { name: "Save avatar", exact: true })
      .click();
    await expect(
      page.getByText("Avatar saved across all your communities.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByLabel("Display name")).toHaveValue("A quiet voice");
    await page.getByLabel("Bio").fill("A small corner for big conversations.");
    await page.getByLabel("Appearance").selectOption("DARK");
    await page.getByRole("button", { name: "teal accent" }).click();
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: /^Profile saved\.$/ }),
    ).toHaveText("Profile saved.");
    await expect(page.locator(".identity-shell")).toHaveAttribute(
      "data-theme",
      "dark",
    );
    await page.reload();
    await expect(page.getByRole("main", { name: "Home feed" })).toHaveAttribute(
      "data-theme",
      "dark",
    );
    await expect(
      page
        .getByRole("article")
        .filter({ hasText: "Some days are just better" })
        .first(),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "artifacts/feed-mobile.png",
      fullPage: true,
      style: "nextjs-portal{visibility:hidden}",
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({
      path: "artifacts/feed-desktop.png",
      fullPage: true,
      style: "nextjs-portal{visibility:hidden}",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Discover", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Trending Topics", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: "artifacts/discover-mobile.png",
      fullPage: false,
      style: "nextjs-portal{visibility:hidden}",
    });
    await page
      .getByRole("button", { name: "Open Bhasar", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Bhasar", exact: true }),
    ).toBeVisible();
    await page
      .locator(".community-hero img")
      .evaluate(async (image: HTMLImageElement) => image.decode());
    await page.screenshot({
      path: "artifacts/community-detail-mobile.png",
      fullPage: false,
      style: "nextjs-portal{visibility:hidden}",
    });
    await page
      .getByRole("button", { name: "Create post", exact: true })
      .click();
    await page.screenshot({
      path: "artifacts/create-post-mobile.png",
      fullPage: false,
      style: "nextjs-portal{visibility:hidden}",
    });
    await page.getByRole("button", { name: /^Audio/ }).click();
    await page.screenshot({
      path: "artifacts/audio-recorder-mobile.png",
      fullPage: false,
      style: "nextjs-portal{visibility:hidden}",
    });
    await page
      .getByRole("button", { name: "Close Create post", exact: true })
      .click();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page
      .getByRole("button", { name: "Your profile", exact: true })
      .click();
    await expect(page.getByLabel("Display name")).toHaveValue("A quiet voice");
    await expect(page.getByLabel("Bio")).toHaveValue(
      "A small corner for big conversations.",
    );
    const savedAvatar = (
      await (await page.request.get("/api/v1/avatars/me")).json()
    ).data;
    expect(savedAvatar.config.accessory).toBe("round-glasses");
    expect(savedAvatar.config.outfit).toBe("blazer");
    const version = (await (await page.request.get("/api/v1/users/me")).json())
      .data.profileVersion;
    const changed = await page.request.patch("/api/v1/users/me", {
      headers: { Origin: "http://localhost:3200" },
      data: { profileVersion: version, bio: "Saved in another window" },
    });
    expect(changed.status()).toBe(200);
    await page.getByLabel("Bio").fill("Stale edit");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "another window" }),
    ).toContainText("another window");
    await page.getByRole("button", { name: "Reload profile" }).click();
    await expect(page.getByLabel("Bio")).toHaveValue("Saved in another window");
    await expect(
      page.getByRole("button", { name: "Deactivate account", exact: true }),
    ).toBeDisabled();
    const crossOrigin = await page.request.patch("/api/v1/users/me", {
      headers: { Origin: "https://evil.example" },
      data: { profileVersion: version, bio: "forbidden" },
    });
    expect(crossOrigin.status()).toBe(403);
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const state = randomBytes(32).toString("base64url");
    await page.goto(`/mobile-connect?challenge=${challenge}&state=${state}`);
    await expect(
      page.getByRole("button", { name: /Continue to the app/ }),
    ).toBeVisible();
    // Exercise the actual consent button and capture its fixed callback without launching another app.
    let code = "";
    await page.route("circlesocial://**", (route) => route.abort());
    const grant = page.waitForResponse(
      (r) =>
        r.url().endsWith("/auth/mobile/authorize") &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name: /Continue to the app/ }).click();
    code = (await (await grant).json()).data.code;
    const exchange = await request.post(
      "http://127.0.0.1:3201/v1/auth/mobile/exchange",
      {
        headers: { Origin: "http://localhost:3200" },
        data: { code, verifier },
      },
    );
    expect(exchange.status()).toBe(200);
    const token = (await exchange.json()).data.token;
    const nativeProfile = await request.get(
      "http://127.0.0.1:3201/v1/users/me",
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(nativeProfile.status()).toBe(200);
    expect((await nativeProfile.json()).data.id).toBe(identity.id);
    const replay = await request.post(
      "http://127.0.0.1:3201/v1/auth/mobile/exchange",
      {
        headers: { Origin: "http://localhost:3200" },
        data: { code, verifier },
      },
    );
    expect(replay.status()).toBe(401);
    await page.goto("/");
    await page
      .getByRole("button", { name: "Your profile", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Make it yours" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(
      page.getByRole("button", { name: /Already here/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Already here/ }).click();
    await page
      .getByRole("button", { name: "Continue with Passkey", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Your profile", exact: true })
      .click();
    await expect(page.getByLabel("Display name")).toHaveValue("A quiet voice");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "artifacts/identity-mobile-width.png",
      fullPage: true,
      style: "nextjs-portal{visibility:hidden}",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({
      path: "artifacts/identity-desktop.png",
      fullPage: true,
      style: "nextjs-portal{visibility:hidden}",
    });
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.getByRole("button", { name: /Already here/ }).click();
    await page
      .getByRole("button", {
        name: "Can’t access your account? Recover account",
        exact: true,
      })
      .click();
    await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });
    await page
      .getByLabel("Recovery credential", { exact: true })
      .fill(savedRecovery!);
    await page
      .getByRole("button", {
        name: "Verify and create a new passkey",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "Save your recovery credential." }),
    ).toBeVisible();
    expect(
      (
        await request.get("http://127.0.0.1:3201/v1/users/me", {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).status(),
    ).toBe(401);
    await page
      .getByRole("button", {
        name: "Generate recovery credential",
        exact: true,
      })
      .click();
    await page
      .getByRole("checkbox", {
        name: "I have saved my recovery credential securely",
      })
      .check();
    await page
      .getByRole("button", { name: "Confirm saved credential", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Credential confirmed", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    execFileSync(
      "pnpm",
      ["--filter", "api", "exec", "node", "scripts/reset-e2e-limits.mjs"],
      { stdio: "pipe" },
    );
    await page
      .getByRole("button", { name: "Your profile", exact: true })
      .click();
    await page.getByLabel("Type your handle to confirm").fill(identity.handle);
    await page
      .getByRole("button", { name: "Deactivate account", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("deactivated");
    expect((await page.request.get("/api/v1/users/me")).status()).toBe(401);
    expect(
      (
        await request.get("http://127.0.0.1:3201/v1/users/me", {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).status(),
    ).toBe(401);
  } finally {
    if (identity)
      execFileSync(
        "pnpm",
        [
          "--filter",
          "api",
          "exec",
          "node",
          "scripts/cleanup-e2e.mjs",
          identity.id,
          identity.handle,
        ],
        { stdio: "pipe" },
      );
  }
});

test("local mobile registration completes setup before session handoff", async ({
  page,
  context,
  request,
}) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  const verifier = randomBytes(32).toString("base64url"),
    challenge = createHash("sha256").update(verifier).digest("base64url"),
    state = randomBytes(32).toString("base64url");
  const handle = "mobile_fox_" + Math.floor(1000 + Math.random() * 9000);
  let identity: { id: string; handle: string } | undefined;
  try {
    const setup = {
      gender: null,
      vibe: "DARK",
      backgroundId: "midnight",
      interests: [],
    };
    await page.goto(
      `/mobile-connect?challenge=${challenge}&state=${state}&registerHandle=${handle}&setup=${encodeURIComponent(JSON.stringify(setup))}`,
    );
    await page
      .getByRole("button", { name: "Set up passkey", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Save your recovery credential." }),
    ).toBeVisible();
    const p = (await (await page.request.get("/api/v1/users/me")).json()).data;
    identity = { id: p.id, handle: p.handle };
    expect(p.onboardingCompletedAt).toBeNull();
    await page
      .getByRole("button", {
        name: "Generate recovery credential",
        exact: true,
      })
      .click();
    await page
      .getByRole("checkbox", {
        name: "I have saved my recovery credential securely",
      })
      .check();
    await page
      .getByRole("button", { name: "Confirm saved credential", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Credential confirmed", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page
      .getByRole("button", { name: "Skip and explore first", exact: true })
      .click();
    await expect(page.locator(".review-card")).toContainText("dark");
    await expect(page.locator(".review-card")).toContainText("midnight");
    await page
      .getByRole("button", { name: "Complete registration", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "You’re one of us now." }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByRole("main", { name: "Home feed" })).toBeVisible();
    const sessionCheck = page.waitForResponse((r) =>
      r.url().endsWith("/api/v1/auth/me"),
    );
    await page
      .getByRole("button", { name: "Continue to app", exact: true })
      .click();
    expect((await sessionCheck).status()).toBe(200);
    await expect(
      page.getByRole("button", { name: /Continue to the app/ }),
    ).toBeVisible();
    await page.route("circlesocial://**", (route) => route.abort());
    const grant = page.waitForResponse(
      (r) =>
        r.url().endsWith("/auth/mobile/authorize") &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name: /Continue to the app/ }).click();
    const code = (await (await grant).json()).data.code;
    const exchanged = await request.post(
      "http://127.0.0.1:3201/v1/auth/mobile/exchange",
      {
        headers: { Origin: "http://localhost:3200" },
        data: { code, verifier },
      },
    );
    expect(exchanged.status()).toBe(200);
    const token = (await exchanged.json()).data.token;
    const native = (
      await (
        await request.get("http://127.0.0.1:3201/v1/users/me", {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).json()
    ).data;
    expect(native.id).toBe(p.id);
    expect(native.onboarding).toEqual(setup);
    expect(native.onboardingCompletedAt).toBeTruthy();
    expect(
      (
        await request.get("http://127.0.0.1:3201/v1/feed", {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).status(),
    ).toBe(200);
  } finally {
    if (identity)
      execFileSync(
        "pnpm",
        [
          "--filter",
          "api",
          "exec",
          "node",
          "scripts/cleanup-e2e.mjs",
          identity.id,
          identity.handle,
        ],
        { stdio: "pipe" },
      );
  }
});
