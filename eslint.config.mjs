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
const DB_CLIENT_ZONE = [
  "db/**",
  "features/*/data/**",
  "tests/integration/**",
  "tests/r2/**",
];

/**
 * Zona do tempo (D-059).
 *
 * `lib/datetime.ts` é o único módulo autorizado a formatar ou interpretar data
 * e hora, com `America/Sao_Paulo` declarado. Fora dele, formatar sem declarar o
 * fuso funciona na máquina de quem escreve — que está em São Paulo — e quebra
 * na Vercel, que roda em UTC: um "sábado, 14 de junho" vira "sexta, 13".
 *
 * Nenhum teste local acusa isso, então a proibição precisa ser do build.
 */
const DATETIME_ZONE = ["lib/datetime.ts", "tests/datetime.test.ts"];

/** Leitores de `Date` que respondem no fuso do processo, não no do app. */
const LOCAL_DATE_READERS = [
  "getDate",
  "getDay",
  "getFullYear",
  "getHours",
  "getMinutes",
  "getMonth",
  "getSeconds",
  "getYear",
  "setDate",
  "setFullYear",
  "setHours",
  "setMinutes",
  "setMonth",
  "toLocaleDateString",
  "toLocaleString",
  "toLocaleTimeString",
];

const datetimeRestriction = {
  files: ["**/*.{ts,tsx,mts}"],
  ignores: DATETIME_ZONE,
  rules: {
    "no-restricted-properties": [
      "error",
      ...LOCAL_DATE_READERS.map((property) => ({
        property,
        message:
          `\`${property}\` responde no fuso do processo. Use lib/datetime.ts, ` +
          "que declara America/Sao_Paulo em toda chamada (D-059).",
      })),
      {
        object: "Intl",
        property: "DateTimeFormat",
        message:
          "Intl.DateTimeFormat sem timeZone usa o fuso do processo. " +
          "Toda formatação de data e hora vive em lib/datetime.ts (D-059).",
      },
    ],
  },
};

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
  datetimeRestriction,
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
