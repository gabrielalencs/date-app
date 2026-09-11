import { isMediaVariant, type MediaVariant } from "@/features/media/constants";
import { getMediaObject } from "@/features/media/data/queries";
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
    const alvo = await getMediaObject(ctx, id, variantFrom(request.url));
    const objeto = await getObject(alvo.objectKey);

    if (!objeto) {
      /* A linha existe e o objeto não: só acontece se alguém apagou o objeto
         por fora. Do lado de quem pede, é a mesma coisa que não existir. */
      return notFound();
    }

    const headers = new Headers({
      "Content-Type": objeto.contentType,
      "Cache-Control": CACHE,
      // A URL não carrega o nome do arquivo; o browser não deve adivinhar tipo.
      "X-Content-Type-Options": "nosniff",
    });

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
