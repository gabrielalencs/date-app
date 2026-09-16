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
    /**
     * Um arquivo por vez.
     *
     * Estes testes escrevem no **mesmo** banco de development, criam e apagam
     * workspaces e contam linhas. Em paralelo eles medem uns aos outros: com o
     * nono arquivo (notificações), a suíte passou a acusar 20 falhas, entre
     * elas um deadlock de Postgres (`40P01`) em `delete from workspaces` e
     * contagens de avaliação vendo o dobro das linhas.
     *
     * É a mesma conclusão a que o B10 chegou no Playwright e o B11 fixou em
     * `workers: 1`: aqui não existe o que paralelizar, porque existe um banco
     * só. Paralelismo não é ganho de tempo, é fonte de teste instável.
     */
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
