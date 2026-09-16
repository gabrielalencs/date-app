import { saveSubscription } from "@/features/notifications/data/subscriptions";
import { requireAuthorizedContext } from "@/lib/auth/authorization";
import { ForbiddenError, UnauthenticatedError } from "@/lib/auth/errors";
import { z } from "zod";

/**
 * A rota que o Service Worker usa para reinscrever depois de um
 * `pushsubscriptionchange`.
 *
 * Existe porque um Service Worker não consegue chamar Server Action; todo o
 * resto do fluxo de subscription passa pelas actions. A autoridade é a mesma:
 * `requireAuthorizedContext()` resolve profile e workspace a partir do cookie
 * que o `fetch` do worker carrega, e o corpo da requisição só fornece a
 * subscription — nunca quem ela é.
 *
 * Sem sessão responde 401 e não grava nada. Nada aqui devolve dado do produto.
 */
export const dynamic = "force-dynamic";

const schema = z.strictObject({
  endpoint: z.url().max(2048),
  keys: z.strictObject({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(256),
  }),
});

export async function POST(request: Request): Promise<Response> {
  let ctx;
  try {
    ctx = await requireAuthorizedContext();
  } catch (error) {
    if (
      error instanceof UnauthenticatedError ||
      error instanceof ForbiddenError
    ) {
      return new Response(null, { status: 401 });
    }
    throw error;
  }

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  const parsed = schema.safeParse(corpo);
  if (!parsed.success) {
    /* Sem detalhe do parser na resposta: a forma do payload é informação sobre
       a fronteira, e esta rota não precisa ensinar ninguém a acertá-la. */
    return new Response(null, { status: 400 });
  }

  await saveSubscription(ctx, {
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
  });

  return new Response(null, { status: 204 });
}
