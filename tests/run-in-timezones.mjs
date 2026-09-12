import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * Roda a suíte de tempo em três fusos (D-060).
 *
 * Por que um script Node e não `TZ=x vitest` no `package.json`:
 *
 * - `cmd.exe`, que é o shell do `pnpm run` no Windows, não tem a sintaxe
 *   `VAR=valor comando`;
 * - o Git Bash **descarta** a variável `TZ` quando o valor é uma zona IANA
 *   nomeada. Medido nesta máquina: `TZ=America/New_York node -e "...process.env.TZ"`
 *   imprime `undefined`, enquanto `TZ=UTC` passa. O teste rodaria no fuso local
 *   achando que rodou em Nova York — verde mentindo, que é pior que vermelho.
 *
 * Passar o ambiente ao processo filho não depende de shell nenhum. Node 24.11.1
 * honra `TZ` no Windows: verificado em UTC, America/New_York, Asia/Tokyo e
 * America/Sao_Paulo, cada um resolvendo para si mesmo.
 *
 * O fuso local entra como terceiro caso porque é o da máquina de quem
 * desenvolve, e é justamente aquele em que o defeito de fuso não aparece.
 */
const FUSOS = ["UTC", "America/New_York", null];

const vitest = fileURLToPath(
  new URL("../node_modules/vitest/vitest.mjs", import.meta.url),
);

/**
 * A lista padrão cresce com cada bloco que acrescenta lógica de tempo. O
 * calendário entra aqui porque agrupamento por dia civil é exatamente o tipo de
 * defeito que só aparece fora do fuso de quem escreve (D-073).
 */
const SUITES = ["tests/datetime.test.ts", "tests/calendar.test.ts"];

const alvo = process.argv.slice(2);
const padrao = alvo.length > 0 ? alvo : SUITES;

let falhou = false;

for (const fuso of FUSOS) {
  const rotulo = fuso ?? "(fuso local desta máquina)";
  console.log(`\n${"=".repeat(60)}\nTZ = ${rotulo}\n${"=".repeat(60)}`);

  const env = { ...process.env };
  if (fuso) {
    env.TZ = fuso;
  } else {
    delete env.TZ;
  }

  const resultado = spawnSync(process.execPath, [vitest, "run", ...padrao], {
    stdio: "inherit",
    env,
  });

  if (resultado.status !== 0) {
    falhou = true;
    console.error(`\nFALHOU em TZ=${rotulo}`);
  }
}

if (falhou) {
  console.error("\nA suíte de tempo não passa em todos os fusos.");
  process.exit(1);
}

console.log("\nA suíte de tempo passa nos três fusos.");
