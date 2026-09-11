import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Zona de importação do handle do banco (D-037).
 *
 * Um tipo não impede ninguém de importar `db` e escrever um where sem
 * workspace: compila, passa no lint e vaza o workspace inteiro. Aqui a
 * consulta sem escopo deixa de ser erro de revisão e vira erro de build.
 */
/* Teste alcança o banco porque precisa montar o estado que vai provar — o que a
   zona protege é código de produto, não a suíte. O `tests/integration/**` já
   estabelecia isso; o `tests/e2e/**` entra no B5 para o teste da rota de mídia
   poder criar a mídia de outro workspace que ele precisa não conseguir ler. */
const DB_CLIENT_ZONE = [
  "db/**",
  "features/*/data/**",
  "tests/integration/**",
  "tests/e2e/**",
  "tests/r2/**",
];

const dbClientRestriction = {
  files: ["**/*.{ts,tsx,mts}"],
  ignores: DB_CLIENT_ZONE,
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["**/db/client", "**/db/client.ts", "@/db/client*"],
            message:
              "O banco só é alcançável por db/** e features/*/data/**. " +
              "Página, componente, Server Action e helper usam as funções de " +
              "features/*/data/, que recebem AuthorizedContext e escopam por workspace.",
          },
        ],
      },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  dbClientRestriction,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
