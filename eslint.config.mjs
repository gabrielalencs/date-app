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

/**
 * Leitores UTC de `Date` (D-073).
 *
 * O buraco que o B7 abriu: a zona do D-059 cobria formatação, não agrupamento.
 * `getUTCDate()` sobre um instante responde em UTC, e um date às 23:00 de 30 de
 * setembro em São Paulo é 1º de outubro em UTC — a célula errada da grade.
 *
 * Dentro do `lib/datetime.ts` eles são legítimos, porque lá operam sobre tripla
 * civil já convertida, onde o UTC é só um eixo numérico sem fuso (D-074).
 */
const UTC_DATE_READERS = [
  "getUTCDate",
  "getUTCDay",
  "getUTCFullYear",
  "getUTCHours",
  "getUTCMonth",
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
      ...UTC_DATE_READERS.map((property) => ({
        property,
        message:
          `\`${property}\` responde em UTC, não no fuso do app. Um date às ` +
          "23:00 de 30/09 é 01/10 em UTC, e cai na célula errada da grade. " +
          "Agrupe por dayKey() e faça aritmética de calendário em " +
          "lib/datetime.ts (D-073, D-074).",
      })),
      {
        object: "Intl",
        property: "DateTimeFormat",
        message:
          "Intl.DateTimeFormat sem timeZone usa o fuso do processo. " +
          "Toda formatação de data e hora vive em lib/datetime.ts (D-059).",
      },
    ],
    /* `toISOString()` sozinho continua permitido: serializar é uso legítimo. O
       que se proíbe é o recorte, que é usá-lo para responder "que dia é" — e
       que nenhum teste atual pegaria, porque nenhuma data do seed cruza a
       meia-noite UTC (D-073). */
    "no-restricted-syntax": [
      "error",
      {
        selector:
          "MemberExpression[object.type='CallExpression']" +
          "[object.callee.property.name='toISOString']" +
          "[property.name=/^(slice|substring|substr|split)$/]",
        message:
          "Recortar toISOString() devolve o dia em UTC, que às 21h de São " +
          "Paulo já é o dia seguinte. Use dayKey() de lib/datetime.ts (D-073).",
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
