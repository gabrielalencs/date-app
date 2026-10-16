import {
  MAX_RANGE_RESPONSE_BYTES,
  isAllowedForVariant,
  isMediaVariant,
  type MediaVariant,
} from "@/features/media/constants";
import { getMediaObject } from "@/features/media/data/queries";
import {
  contentRange,
  rangeHeader,
  rangeLength,
  resolveRange,
} from "@/features/media/http-range";
import { getObject } from "@/features/media/r2/client";
import { requireAuthorizedContext } from "@/lib/auth/authorization";
import { ForbiddenError, UnauthenticatedError } from "@/lib/auth/errors";
import { NotFoundError } from "@/lib/errors";

/**
 * Leitura de mídia (seção 6 do docs/MEDIA_R2.md, D-052).
 *
 * Não existe URL assinada de leitura. Uma URL assinada continua válida depois
 * que a aba fecha, é compartilhável por acidente e muda a cada render, o que
 * destrói cache. Aqui o contexto é resolvido a cada requisição, a linha é
 * buscada com predicado de workspace, e só então os bytes saem do R2.
 *
 * Media de outro workspace responde "não encontrado", igual a id inexistente
 * (D-038). Quem não está autenticado também recebe 404: para quem está de fora,
 * a rota não distingue "não é sua" de "não existe".
 *
 * **Range** (D-184). O `<video>` pede o arquivo em pedaços, e cada pedaço é
 * uma requisição inteira por aqui: sessão, linha escopada, R2. Responder 206
 * com no máximo 4 MB mantém cada resposta abaixo do teto de corpo das funções
 * da Vercel; o navegador pede a continuação sozinho. O tamanho total vem da
 * linha — gravado do `HeadObject` na confirmação, e o objeto nunca muda.
 */
export const dynamic = "force-dynamic";

const CACHE = "private, max-age=604800, immutable";

function notFound(): Response {
  return new Response("Imagem não encontrada.", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function variantFrom(url: string): MediaVariant {
  const pedido = new URL(url).searchParams.get("v");
  return isMediaVariant(pedido) ? pedido : "full";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;

  try {
    const ctx = await requireAuthorizedContext();
    const variant = variantFrom(request.url);
    const alvo = await getMediaObject(ctx, id, variant);

    /* Range só no `full`: é o único cujo tamanho a linha conhece, e o único
       que é vídeo. O `thumb` é sempre uma imagem de poucos KB. */
    const decisao =
      variant === "full"
        ? resolveRange(
            request.headers.get("range"),
            alvo.sizeBytes,
            MAX_RANGE_RESPONSE_BYTES,
          )
        : ({ kind: "whole" } as const);

    if (decisao.kind === "unsatisfiable") {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${alvo.sizeBytes}` },
      });
    }

    const objeto = await getObject(
      alvo.objectKey,
      decisao.kind === "partial" ? rangeHeader(decisao.range) : undefined,
    );

    if (!objeto) {
      /* A linha existe e o objeto não: só acontece se alguém apagou o objeto
         por fora. Do lado de quem pede, é a mesma coisa que não existir. */
      return notFound();
    }

    /* Revalidação na leitura, não só na gravação (seção 7 do
       docs/PWA_AND_HARDENING.md). Custa uma comparação de string e fecha o caso
       do valor que entrou no bucket antes de a allowlist existir — ou por fora
       dela. Tipo fora da lista não vira 500 nem vaza: some, igual a id que não
       existe. O `thumb` só pode ser imagem, mesmo num vídeo. */
    if (!isAllowedForVariant(variant, objeto.contentType)) {
      return notFound();
    }

    const headers = new Headers({
      "Content-Type": objeto.contentType,
      "Cache-Control": CACHE,
      // A URL não carrega o nome do arquivo; o browser não deve adivinhar tipo.
      "X-Content-Type-Options": "nosniff",
      /* Explícito: a foto é para ser vista na página, não baixada. Sem isto o
         comportamento fica a cargo do palpite do navegador. */
      "Content-Disposition": "inline",
    });

    if (variant === "full") {
      // Diz ao `<video>` que dá para pular para qualquer ponto.
      headers.set("Accept-Ranges", "bytes");
    }

    if (decisao.kind === "partial") {
      headers.set("Content-Range", contentRange(decisao.range, alvo.sizeBytes));
      headers.set("Content-Length", String(rangeLength(decisao.range)));
      return new Response(objeto.body, { status: 206, headers });
    }

    if (objeto.sizeBytes !== undefined) {
      headers.set("Content-Length", String(objeto.sizeBytes));
    }

    return new Response(objeto.body, { status: 200, headers });
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof UnauthenticatedError ||
      error instanceof ForbiddenError
    ) {
      return notFound();
    }
    throw error;
  }
}
