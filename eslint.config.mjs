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

/**
 * Propriedades proibidas pela zona do tempo (D-059, D-073).
 *
 * `lib/datetime.ts` é o único módulo autorizado a formatar ou interpretar data
 * e hora, com `America/Sao_Paulo` declarado. Fora dele, formatar sem declarar o
 * fuso funciona na máquina de quem escreve — que está em São Paulo — e quebra
 * na Vercel, que roda em UTC: um "sábado, 14 de junho" vira "sexta, 13".
 *
 * Nenhum teste local acusa isso, então a proibição precisa ser do build.
 */
const DATETIME_PROPERTIES = [
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
];

/**
 * Propriedades proibidas pela zona do dinheiro (B8).
 *
 * `lib/money.ts` é o único módulo autorizado a interpretar ou formatar valor
 * monetário. Fora dele, `parseFloat` sobre texto em pt-BR é o defeito que este
 * bloco existe para impedir:
 *
 *     parseFloat("1.234,56")  →  1.234  →  grava R$ 1,23
 *
 * Cem vezes menor, plausível na tela, e sem exceção nenhuma. `toFixed` entra
 * junto porque é como o float volta na saída, depois de um `cents / 100`.
 */
const MONEY_MESSAGE =
  "Dinheiro é inteiro de centavos e vive em lib/money.ts. " +
  '`parseFloat("1.234,56")` devolve 1.234 e grava R$ 1,23 sem erro nenhum ' +
  "— use parseBRLToCents, formatCents e sumCents.";

const MONEY_PROPERTIES = [
  { object: "Number", property: "parseFloat", message: MONEY_MESSAGE },
  { property: "toFixed", message: MONEY_MESSAGE },
];

/**
 * `no-restricted-properties` é **uma** regra, e em flat config o último bloco
 * que a define para um arquivo substitui os anteriores — não acumula.
 *
 * Dois blocos separados, um para tempo e outro para dinheiro, fazem o segundo
 * apagar o primeiro em silêncio: a zona do dinheiro passou a existir sem barrar
 * `Number.parseFloat` nem `toFixed`, e o lint ficou verde sobre um arquivo que
 * tinha os dois. Foi assim que apareceu, e é por isso que a prova da zona é com
 * arquivo plantado e não por leitura do config.
 *
 * Então a lista é uma só, e as exceções por módulo vêm depois, cada uma
 * redeclarando o que continua valendo ali.
 */
const BASE = "**/*.{ts,tsx,mts}";

const restrictedProperties = {
  files: [BASE],
  rules: {
    "no-restricted-properties": [
      "error",
      ...DATETIME_PROPERTIES,
      ...MONEY_PROPERTIES,
    ],
  },
};

/**
 * `tests/` fica fora da zona do dinheiro: medir pixel com `parseFloat` em
 * navegador é uso legítimo e não tem nada a ver com valor monetário. A zona do
 * tempo continua valendo — um teste que precisasse escapar dela para se
 * escrever estaria provando outra coisa.
 */
const testsKeepDatetimeOnly = {
  files: ["tests/**/*.{ts,tsx,mts}"],
  rules: {
    "no-restricted-properties": ["error", ...DATETIME_PROPERTIES],
  },
};

/** O dono do dinheiro pode usar float; continua sem poder ler `Date` cru. */
const moneyModule = {
  files: ["lib/money.ts"],
  rules: {
    "no-restricted-properties": ["error", ...DATETIME_PROPERTIES],
  },
};

/** O dono do tempo pode ler `Date` cru; continua sob a zona do dinheiro. */
const datetimeModule = {
  files: ["lib/datetime.ts"],
  rules: {
    "no-restricted-properties": ["error", ...MONEY_PROPERTIES],
  },
};

/** A suíte do tempo exercita justamente o que as duas zonas proíbem. */
const datetimeSuite = {
  files: ["tests/datetime.test.ts"],
  rules: {
    "no-restricted-properties": "off",
  },
};

/**
 * `parseFloat` global não colide com nada — é a única regra que usa
 * `no-restricted-globals` — mas segue a mesma geografia da zona do dinheiro.
 */
const moneyGlobals = {
  files: [
    "app/**/*.{ts,tsx}",
    "components/**/*.{ts,tsx}",
    "features/**/*.{ts,tsx}",
    "lib/**/*.{ts,tsx}",
    "db/**/*.{ts,tsx}",
  ],
  ignores: ["lib/money.ts"],
  rules: {
    "no-restricted-globals": [
      "error",
      { name: "parseFloat", message: MONEY_MESSAGE },
    ],
  },
};

/**
 * `toISOString()` sozinho continua permitido: serializar é uso legítimo. O que
 * se proíbe é o recorte, que é usá-lo para responder "que dia é" — e que nenhum
 * teste atual pegaria, porque nenhuma data do seed cruza a meia-noite UTC.
 */
const isoSliceRestriction = {
  files: [BASE],
  ignores: ["lib/datetime.ts", "tests/datetime.test.ts"],
  rules: {
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
  files: [BASE],
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
  isoSliceRestriction,
  moneyGlobals,
  // A ordem abaixo importa: a base primeiro, as exceções por módulo depois.
  restrictedProperties,
  testsKeepDatetimeOnly,
  moneyModule,
  datetimeModule,
  datetimeSuite,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    /* Rotas geradas pelo Workflow SDK a cada build (B11.5). O próprio pacote
       grava um `.gitignore` com `*` dentro dessa pasta, então elas não entram
       no repositório — e lintar código gerado só produz aviso sobre uma
       diretiva que o gerador escreveu de propósito. */
    "app/.well-known/workflow/**",
  ]),
]);

export default eslintConfig;
