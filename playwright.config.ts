import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
/**
 * `localhost`, não `127.0.0.1`: o Neon Auth valida a origem contra uma lista de
 * confiáveis e responde 403 "Invalid origin" para o IP, mesmo na mesma porta.
 * Com o IP, o teste live acusaria login quebrado com a aplicação correta.
 */
const BASE_URL = `http://localhost:${PORT}`;

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
