import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  reporter: "list",
  use: {
    actionTimeout: 10000,
    baseURL: "http://localhost:3200",
    browserName: "chromium",
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    },
    trace: "off",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter api exec node scripts/start-e2e.mjs",
      url: "http://127.0.0.1:3201/v1/health/live",
      env: {
        PORT: "3201",
        HOST: "127.0.0.1",
        NODE_ENV: "test",
        WEB_ORIGIN: "http://localhost:3200",
        LOG_LEVEL: "silent",
        AUTH_RATE_LIMIT: "200",
      },
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command:
        "pnpm --filter web exec next dev --webpack --hostname localhost --port 3200",
      url: "http://localhost:3200",
      env: {
        CIRCLE_API_URL: "http://127.0.0.1:3201",
        CIRCLE_WEB_ORIGIN: "http://localhost:3200",
      },
      reuseExistingServer: false,
      timeout: 90000,
    },
  ],
});
