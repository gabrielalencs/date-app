import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // Marcador de fronteira, não guarda de runtime: resolvido pela mesma
      // condição que o Next usa no servidor, para o teste alcançar módulos
      // server-only sem afrouxar nada em produção.
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: ["tests/integration/**"],
  },
});
