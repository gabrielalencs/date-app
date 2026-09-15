/**
 * Contador de consultas, para provar a exigência de escala da seção 7 do
 * docs/MEMORIES.md:
 *
 * > O número de consultas da timeline é constante em relação ao número de
 * > planos.
 *
 * Sem instrumento não há prova. Com oito planos de seed, uma timeline que faz
 * três consultas por linha responde igual a uma que faz duas, e nada fica
 * vermelho na máquina de ninguém — o defeito só aparece com 150 dates
 * realizados e 50 ms de ida e volta até `sa-east-1`.
 *
 * O contador é o `logger` do Drizzle, que é chamado uma vez por consulta
 * executada. Fica desligado por padrão: em produção o custo é uma chamada de
 * função que testa um booleano e retorna. Ligar e desligar é responsabilidade
 * de quem mede, e `countQueries` garante o desligamento mesmo se a função
 * medida lançar.
 *
 * Não é reentrante de propósito: duas medições aninhadas contariam a mesma
 * consulta duas vezes, e um contador que mente é pior que nenhum.
 */
let ligado = false;
let total = 0;

/** O `logger` que `db/client.ts` entrega ao Drizzle. */
export const queryCounter = {
  logQuery(): void {
    if (ligado) {
      total += 1;
    }
  },
};

export class QueryCounterInUseError extends Error {
  constructor() {
    super(
      "Já existe uma medição de consultas em andamento. " +
        "Medições aninhadas contariam a mesma consulta duas vezes.",
    );
    this.name = "QueryCounterInUseError";
  }
}

/**
 * Roda a função medindo quantas consultas ela dispara.
 *
 * Devolve o resultado junto da contagem, porque quase toda medição também quer
 * conferir o que a consulta trouxe.
 */
export async function countQueries<T>(
  run: () => Promise<T>,
): Promise<{ result: T; queries: number }> {
  if (ligado) {
    throw new QueryCounterInUseError();
  }

  ligado = true;
  total = 0;

  try {
    const result = await run();
    return { result, queries: total };
  } finally {
    ligado = false;
  }
}
