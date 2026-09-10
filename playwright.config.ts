import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Build de produção de propósito: o dev overlay do Next apareceria nas capturas.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
