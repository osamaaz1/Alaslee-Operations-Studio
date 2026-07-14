import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.js",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "diagnostics/playwright-report.json" }]],
  outputDir: "diagnostics/playwright-artifacts",
  use: {
    baseURL: "http://127.0.0.1:3100",
    locale: "ar-SA",
    timezoneId: "Africa/Cairo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "node e2e/server.js",
    url: "http://127.0.0.1:3100/health/live",
    timeout: 60_000,
    reuseExistingServer: false,
    env: { ...process.env, NODE_ENV: "production", HOST: "127.0.0.1", PORT: "3100" },
  },
});
