import { getAuth } from "@/lib/auth/server";
import { isAllowedAuthOperation } from "@/lib/auth/http-policy";

/**
 * `auth.handler()` encaminha TODA a superfície do provedor: sign-up/email,
 * sign-in/social, sign-in/magic-link, sign-in/email-otp, delete-user,
 * update-user e todo o namespace admin/* — incluindo admin/create-user e
 * admin/impersonate-user. Verificado em API_ENDPOINTS do pacote instalado.
 *
 * Por isso a rota não reexporta o handler direto: cada requisição passa por
 * uma allowlist positiva e o que não está nela nunca chega ao Neon (D-030).
 */
type RouteContext = { params: Promise<{ path: string[] }> };

function notFound(): Response {
  return Response.json({ error: "not_found" }, { status: 404 });
}

/**
 * O handler é resolvido só depois da allowlist: operação negada não chega a
 * instanciar o Auth, então bloqueio continua sendo 404 mesmo sem env válido.
 */
async function guard(
  request: Request,
  context: RouteContext,
  pick: (
    handler: ReturnType<ReturnType<typeof getAuth>["handler"]>,
  ) => (request: Request, context: RouteContext) => Promise<Response>,
): Promise<Response> {
  const { path } = await context.params;

  if (!isAllowedAuthOperation(request.method, path)) {
    return notFound();
  }

  return pick(getAuth().handler())(request, context);
}

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  return guard(request, context, (handler) => handler.GET);
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  return guard(request, context, (handler) => handler.POST);
}

/* PUT, DELETE e PATCH não são exportados de propósito: o Next responde 405 e
   nenhuma operação de escrita do provedor fica alcançável por esta rota. */
