import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // O teste roda no servidor; resolve o marcador pela mesma condição do Next.
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    include: ["tests/integration/**/*.integration.test.ts"],
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
