import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.mjs",
  workers: 1,
  timeout: 30000,
  reporter: "list",
});
