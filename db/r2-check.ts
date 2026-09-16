import {
  R2ConfigError,
  describeTarget,
  resolveR2,
} from "../features/media/r2/env.ts";

/**
 * Conferência da guarda do R2, para rodar antes de qualquer byte subir.
 *
 * Imprime branch, bucket e endpoint. Não imprime credencial, não conecta em
 * lugar nenhum e não escreve nada — é só a guarda, executada sozinha, para o
 * proprietário confirmar a olho que o alvo é o de desenvolvimento.
 *
 * Mora em `db/` pela mesma razão que `auth-bootstrap.ts`: é ali que ficam os
 * scripts de linha de comando que rodam com `--experimental-strip-types`, onde
 * o alias `@/` não existe.
 */
function main(): void {
  const { target } = resolveR2(process.env);

  console.log(describeTarget(target));
  console.log("\nGuarda passou: o bucket confere com a branch.");
}

try {
  main();
} catch (error: unknown) {
  if (error instanceof R2ConfigError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
