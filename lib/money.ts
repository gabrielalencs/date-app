/**
 * O único módulo do projeto autorizado a interpretar ou formatar dinheiro
 * (seção 2 do docs/PLANNING.md).
 *
 * Fora daqui o ESLint proíbe `parseFloat`, `Number.parseFloat` e `toFixed`.
 * É a mesma zona que fechou o banco no D-037 e o tempo no D-059, e existe pelo
 * mesmo motivo — mas aqui o defeito é pior, porque **não estoura**:
 *
 *     parseFloat("1.234,56")  →  1.234  →  grava R$ 1,23
 *
 * Cem vezes menor, plausível na tela, e nenhuma exceção. O tempo pelo menos
 * mostra "sexta" onde devia mostrar "sábado"; dinheiro errado parece certo.
 *
 * Regras desta casa:
 *
 * - valor é **inteiro de centavos**, sempre, em toda a pilha (D-025);
 * - a unidade vai no nome de toda função — `formatBRL(value: number)` não diz
 *   se `value` é real ou centavo, e essa ambiguidade é como se erra por cem;
 * - nada aqui usa float. Nem no parse, nem no formato: os dois trabalham sobre
 *   os dígitos. Multiplicar por cem e arredondar acerta nos casos comuns e é a
 *   porta pela qual o float volta;
 * - não há divisão em lugar nenhum do domínio, e é por isso que não há
 *   arredondamento. A ausência de rateio não é só decisão de produto — é o que
 *   mantém a aritmética exata de ponta a ponta.
 */

/**
 * Teto do `integer` do Postgres: R$ 21.474.836,47.
 *
 * Validado aqui para o banco nunca ser quem recusa — erro de driver não tem
 * como ser explicado a quem digitou.
 */
export const MAX_CENTS = 2_147_483_647;

export class InvalidMoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMoneyError";
  }
}

/** Mensagem única de formato, escrita para ensinar em vez de só recusar. */
/* Exportada para o schema do boundary reusar a mesma frase: duas mensagens
   de recusa divergem, e a que divergir vai explicar o formato errado. */
export const FORMATO =
  "Escreva o valor como 80, 80,50 ou 1.234,56 — sem sinal e sem letras.";

/**
 * Espaços que um valor colado traz junto: comum, não separável (o que o próprio
 * `Intl` produz depois do `R$`) e o estreito não separável.
 */
const ESPACOS = /[\s  ]/g;

const SO_DIGITOS = /^\d+$/;

/** Grupo de milhar válido: o primeiro tem 1 a 3 dígitos, os demais exatamente 3. */
function gruposDeMilharValidos(partes: readonly string[]): boolean {
  const [primeiro, ...resto] = partes;

  if (!primeiro || !SO_DIGITOS.test(primeiro) || primeiro.length > 3) {
    return false;
  }

  return resto.every((grupo) => grupo.length === 3 && SO_DIGITOS.test(grupo));
}

/**
 * Junta a parte inteira e a decimal num inteiro de centavos, por concatenação
 * de dígitos — nunca por `Number(x) * 100`.
 */
function paraCentavos(reais: string, centavos: string): number {
  const inteiros = reais === "" ? "0" : reais;
  const fracao = centavos.padEnd(2, "0");

  // String de dígitos → inteiro. Exato até 2^53; o teto corta bem antes.
  return Number(`${inteiros}${fracao}`);
}

/**
 * Texto digitado em pt-BR → inteiro de centavos.
 *
 * Determinístico, e **recusa o ambíguo em vez de adivinhar**. A tabela da seção
 * 2 do docs/PLANNING.md é o teste, linha por linha, e as recusas contam.
 *
 * Lança `InvalidMoneyError`; quem chama transforma em mensagem de formulário.
 */
export function parseBRLToCents(input: string): number {
  const limpo = input.replace(/R\$/gi, "").replace(ESPACOS, "");

  if (limpo === "") {
    throw new InvalidMoneyError("Informe um valor.");
  }

  /* Qualquer coisa fora de dígito, ponto e vírgula sai aqui: o sinal de menos,
     o `e` da notação científica e letras em geral. Gasto negativo não existe
     neste produto, e "1e3" não é como ninguém digita dinheiro. */
  if (!/^[\d.,]+$/.test(limpo)) {
    throw new InvalidMoneyError(FORMATO);
  }

  const virgulas = limpo.split(",").length - 1;

  if (virgulas > 1) {
    throw new InvalidMoneyError(FORMATO);
  }

  let reais: string;
  let centavos: string;

  if (virgulas === 1) {
    // Vírgula manda: ela é o decimal, e os pontos antes dela são milhar.
    const [inteira = "", decimal = ""] = limpo.split(",");

    if (decimal.length < 1 || decimal.length > 2 || !SO_DIGITOS.test(decimal)) {
      throw new InvalidMoneyError(FORMATO);
    }

    /* A validação de grupos só vale quando há ponto: sem separador, a parte
       inteira tem o tamanho que tiver. Exigir grupos de três aqui recusaria
       "1234,56", que é como a maioria das pessoas digita. */
    if (inteira !== "") {
      const malFormada = inteira.includes(".")
        ? !gruposDeMilharValidos(inteira.split("."))
        : !SO_DIGITOS.test(inteira);

      if (malFormada) {
        throw new InvalidMoneyError(FORMATO);
      }
    }

    reais = inteira.replaceAll(".", "");
    centavos = decimal;
  } else if (limpo.includes(".")) {
    /* Sem vírgula, com pontos: o ponto é milhar ou decimal, e a diferença está
       em quantos dígitos vêm depois dele. "1.234" é mil duzentos e trinta e
       quatro; "1.23" é um real e vinte e três centavos. Qualquer combinação que
       não seja claramente uma das duas é recusada — adivinhar aqui é como se
       grava cem vezes menos. */
    const partes = limpo.split(".");
    const ultima = partes[partes.length - 1] ?? "";

    if (gruposDeMilharValidos(partes) && ultima.length === 3) {
      reais = partes.join("");
      centavos = "00";
    } else if (
      partes.length === 2 &&
      SO_DIGITOS.test(partes[0] ?? "") &&
      (ultima.length === 1 || ultima.length === 2) &&
      SO_DIGITOS.test(ultima)
    ) {
      reais = partes[0]!;
      centavos = ultima;
    } else {
      throw new InvalidMoneyError(FORMATO);
    }
  } else {
    if (!SO_DIGITOS.test(limpo)) {
      throw new InvalidMoneyError(FORMATO);
    }
    reais = limpo;
    centavos = "00";
  }

  const total = paraCentavos(reais, centavos);

  if (!Number.isSafeInteger(total) || total > MAX_CENTS) {
    throw new InvalidMoneyError(
      `O valor máximo é ${formatCents(MAX_CENTS)}. Confira se não sobrou um zero.`,
    );
  }

  return total;
}

/** Agrupa só a parte inteira; a decimal é montada à mão, para não passar por float. */
const INTEIRO = new Intl.NumberFormat("pt-BR", {
  useGrouping: true,
  maximumFractionDigits: 0,
});

function assertCentavos(cents: number): void {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError("formatCents espera um inteiro de centavos.");
  }
}

/**
 * Inteiro de centavos → "R$ 1.234,56".
 *
 * Monta a partir dos dígitos em vez de formatar `cents / 100`: dividir por cem
 * devolve um float que não representa 1,23 exatamente, e o `/ 100` solto é
 * justamente o que a varredura deste bloco procura.
 *
 * O separador depois de `R$` é o espaço não separável, igual ao que o `Intl`
 * produz para BRL — a suíte compara os dois formatos para eles não divergirem.
 */
export function formatCents(cents: number): string {
  assertCentavos(cents);

  const negativo = cents < 0;
  const digitos = String(Math.abs(cents)).padStart(3, "0");
  const reais = digitos.slice(0, -2);
  const centavos = digitos.slice(-2);

  const corpo = `R$ ${INTEIRO.format(Number(reais))},${centavos}`;
  return negativo ? `-${corpo}` : corpo;
}

/**
 * Inteiro de centavos → "1234,56", para preencher o campo.
 *
 * Sem separador de milhar de propósito: o valor volta pelo `parseBRLToCents`
 * quando o formulário é reenviado, e menos pontuação é menos chance de o
 * round-trip perder alguma coisa.
 */
export function centsToInputValue(cents: number | null): string {
  if (cents === null) return "";
  assertCentavos(cents);

  const digitos = String(Math.abs(cents)).padStart(3, "0");
  const sinal = cents < 0 ? "-" : "";

  return `${sinal}${digitos.slice(0, -2)},${digitos.slice(-2)}`;
}

/**
 * Soma exata. Inteiro com inteiro é exato por construção — a função existe para
 * dar um lugar onde a asserção mora, não porque somar seja difícil.
 */
export function sumCents(values: readonly number[]): number {
  let total = 0;

  for (const valor of values) {
    assertCentavos(valor);
    total += valor;
  }

  if (!Number.isSafeInteger(total)) {
    throw new RangeError("A soma passou do inteiro seguro.");
  }

  return total;
}
