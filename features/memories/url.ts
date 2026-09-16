/**
 * A página da timeline mora na URL: `/memorias?pagina=2` (seção 6).
 *
 * Por número e não por cursor. Cursor seria mais correto num feed vivo, mas
 * aqui a lista é de passado e praticamente imóvel — um plano só entra nela
 * quando alguém marca algo como realizado, o que acontece uma vez por date.
 * Cursor composto de instante mais id numa URL é feio e não compra nada.
 *
 * Navegação por link, como o mês da agenda: a leitura funciona sem JavaScript
 * e cada página é uma URL de verdade.
 */
export const MEMORIES_PATH = "/memorias";

/**
 * O número que veio da URL → página real, contada de 1.
 *
 * Nunca lança e nunca devolve 500: quem chama é uma barra de endereço, e
 * `?pagina=abc`, `?pagina=-1` e `?pagina=0` caem todos na primeira página, do
 * mesmo jeito que o mês inválido da agenda cai no mês corrente (D-078).
 *
 * Dígitos, e não `Number()`: aquilo aceita `1e3`, `0x10` e `+5`, que são
 * números finitos e viram páginas que ninguém digitou. A regex é a mesma
 * decisão que `parseMonthParam` tomou ao ler o par de números à mão.
 *
 * O teto existe porque `?pagina=99999999999` passaria pela regex e viraria um
 * OFFSET absurdo no banco.
 */
export const MAX_PAGE = 10_000;

const PAGINA = /^\d+$/;

export function parsePageParam(raw: string | null | undefined): number {
  const texto = raw?.trim() ?? "";

  if (!PAGINA.test(texto)) return 1;

  const numero = Number(texto);

  if (numero < 1) return 1;

  return Math.min(numero, MAX_PAGE);
}

/** Quantas páginas a lista tem. Zero memórias ainda é uma página: a vazia. */
export function pageCount(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage));
}

export function memoriesHref(page: number): string {
  return page <= 1 ? MEMORIES_PATH : `${MEMORIES_PATH}?pagina=${page}`;
}
