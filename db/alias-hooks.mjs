/**
 * Resolve o alias `@/` fora do Next.
 *
 * Os scripts de `db/` rodam em Node puro, onde `@/lib/datetime` não existe — o
 * alias é do `tsconfig.json`, e quem o entende é o bundler do Next e o
 * `resolve.alias` dos configs do Vitest. Um script que precise de código de
 * `features/` esbarra nisso na primeira importação transitiva, e o erro é um
 * `ERR_MODULE_NOT_FOUND` apontando para um pacote chamado `@/lib`.
 *
 * A alternativa seria trocar `@/` por caminho relativo dentro de `features/`,
 * o que quebraria a convenção do repositório inteiro para atender um script.
 * Este arquivo sai mais barato e fica contido em `db/`.
 */

/** A raiz do repositório: este arquivo mora em `db/`. */
const RAIZ = new URL("../", import.meta.url);

export async function resolve(especificador, contexto, proximo) {
  if (!especificador.startsWith("@/")) {
    return proximo(especificador, contexto);
  }

  /* O repositório escreve `@/lib/datetime`, sem extensão, porque o bundler do
     Next completa. Node não completa: sem o `.ts` aqui, o alias resolve para um
     caminho que não existe e o erro vira `ERR_MODULE_NOT_FOUND` apontando para
     um arquivo sem extensão. */
  const caminho = especificador.slice(2);
  const comExtensao = /\.[a-z]+$/i.test(caminho) ? caminho : `${caminho}.ts`;

  return proximo(new URL(comExtensao, RAIZ).href, contexto);
}
