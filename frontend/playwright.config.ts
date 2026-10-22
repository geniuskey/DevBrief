import { defineConfig } from "@playwright/test";
export default defineConfig({
  globalSetup: "./e2e/global-setup.ts",
  testDir: "./e2e",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:5174",
    headless: true,
    trace: "retain-on-failure",
  },
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
});
