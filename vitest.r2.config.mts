import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Round-trip real contra o bucket `date-media-dev`. Separado do `pnpm test` de
 * propósito: o portão precisa ficar verde numa máquina sem credencial de R2.
 * Roda por `pnpm test:media`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    include: ["tests/r2/**/*.test.ts"],
    // Sobe e apaga objetos de verdade; paralelismo aqui só cria corrida.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 60_000,
  },
});
