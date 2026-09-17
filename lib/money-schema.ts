import { z } from "zod";

import { FORMATO, InvalidMoneyError, parseBRLToCents } from "@/lib/money";

/**
 * O boundary de entrada do dinheiro, para o Zod.
 *
 * **Por que num arquivo separado de `lib/money.ts`.** Estes dois schemas são
 * usados só por Server Action, mas moravam ao lado de `formatCents` e
 * `centsToInputValue`, que componentes client importam para desenhar a tela. O
 * empacotador não separa um módulo pela metade: importar o formatador puxava o
 * arquivo inteiro, e com ele **o Zod inteiro para dentro do bundle do
 * navegador** — medido, 10 ocorrências de `ZodError` e 91 de `invalid_type` num
 * chunk entregue ao celular, para uma biblioteca que só valida no servidor.
 *
 * A regra de "o dinheiro tem um dono" continua valendo: o parse de verdade
 * segue em `lib/money.ts` e é importado daqui. O que se separou foi a casca de
 * validação, não a lógica — duas cópias do parse é que divergiriam.
 */
/**
 * O boundary de entrada, para o Zod.
 *
 * Vive aqui, e não em cada `actions/`, porque a mensagem de recusa e as regras
 * de parse precisam ser as mesmas no orçamento do plano e no valor do gasto.
 * Duas cópias divergem, e a que divergir vai aceitar o que a outra recusa.
 */
function transformarEmCentavos(
  raw: string,
  ctx: { addIssue: (issue: { code: "custom"; message: string }) => void },
): number | typeof z.NEVER {
  try {
    return parseBRLToCents(raw);
  } catch (erro) {
    ctx.addIssue({
      code: "custom",
      message: erro instanceof InvalidMoneyError ? erro.message : FORMATO,
    });
    return z.NEVER;
  }
}

/** Valor obrigatório: vazio é recusado. */
export const centsFromText = z
  .string()
  .transform((raw, ctx) => transformarEmCentavos(raw, ctx));

/** Valor opcional: vazio vira `null`, e só o resto passa pelo parse. */
export const optionalCentsFromText = z
  .string()
  .transform((raw, ctx) =>
    raw.trim() === "" ? null : transformarEmCentavos(raw, ctx),
  );
