import {
  BEFORE_CREATE,
  decideUserBeforeCreate,
  maskEmailForLog,
  readWebhookHeaders,
  verifyWebhookSignature,
  type Jwks,
} from "@/lib/auth/webhook";
import { getAuthConfig } from "@/lib/auth/env";

/**
 * Webhook `user.before_create` do Managed Better Auth (D-043).
 *
 * Pré-condição do primeiro deploy, não item de checklist. A allowlist da rota
 * `/api/auth` protege o **nosso** domínio; ela não protege o serviço do Neon,
 * que aceita cadastro de qualquer origem que conheça a base URL — é exatamente
 * o que o `auth:create-dev-users` explora. Este endpoint é o único lugar em que
 * o "só dois usuários" da V1 vira regra do provedor.
 *
 * Fecha por padrão em todos os caminhos: env faltando, assinatura inválida,
 * corpo ilegível e e-mail fora da allowlist terminam em recusa. O provedor
 * também falha fechado do lado dele — resposta não-2xx ou inválida rejeita o
 * cadastro —, então errar para o lado de negar nunca cria conta indevida.
 *
 * Deduplicação de entrega: o provedor reenvia com o mesmo `X-Neon-Event-Id` e
 * pede a mesma resposta. A decisão aqui é função pura do corpo — mesmo e-mail,
 * mesma resposta — então não há estado a guardar para satisfazer isso.
 */

/* Ed25519 pelo `node:crypto`. Não roda no edge. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Recusa sem detalhe: 2xx é obrigatório para o provedor ler a decisão. */
function recusa(motivo: string): Response {
  console.warn(`[webhook] cadastro recusado: ${motivo}`);
  return Response.json(
    {
      allowed: false,
      error_message: "Este aplicativo não aceita cadastro.",
      error_code: "DATE_SIGNUP_CLOSED",
    },
    { status: 200 },
  );
}

/**
 * Cache do JWKS por `kid`.
 *
 * Buscar a cada entrega transformaria cada login-tentativa numa ida de rede a
 * mais, e o `kid` é estável entre rotações. A busca só acontece quando o `kid`
 * recebido não está em mãos, com piso de tempo entre buscas para uma sequência
 * de `kid` inventado não virar amplificação contra o Neon.
 */
const JWKS_REFETCH_FLOOR_MS = 60_000;

let jwksCache: Jwks | undefined;
let jwksFetchedAt = 0;

async function fetchJwks(baseUrl: string): Promise<Jwks | undefined> {
  try {
    const response = await fetch(
      new URL(".well-known/jwks.json", `${baseUrl}/`),
      { cache: "no-store" },
    );
    if (!response.ok) return undefined;
    return (await response.json()) as Jwks;
  } catch {
    return undefined;
  }
}

async function jwksFor(
  baseUrl: string,
  kid: string,
): Promise<Jwks | undefined> {
  const conhecido = jwksCache?.keys?.some((key) => key.kid === kid) ?? false;
  const podeBuscar = Date.now() - jwksFetchedAt > JWKS_REFETCH_FLOOR_MS;

  if (conhecido || !podeBuscar) {
    return jwksCache;
  }

  jwksFetchedAt = Date.now();
  const fresh = await fetchJwks(baseUrl);
  if (fresh) jwksCache = fresh;

  return jwksCache;
}

export async function POST(request: Request): Promise<Response> {
  /* O corpo cru, antes de qualquer parse: a assinatura cobre os bytes
     exatos, e `await request.json()` os perde para sempre. */
  const rawBody = await request.text();

  const headers = readWebhookHeaders(request.headers);
  if (!headers) {
    return recusa("headers de assinatura ausentes");
  }

  let baseUrl: string;
  let allowedEmails: readonly string[];

  try {
    const config = getAuthConfig();
    baseUrl = config.baseUrl;
    allowedEmails = config.allowedEmails;
  } catch {
    /* Sem env válido não há allowlist a consultar. Recusar é o único
       comportamento honesto: o contrário seria abrir o cadastro por variável
       esquecida. */
    return recusa("ambiente de auth incompleto");
  }

  const jwks = await jwksFor(baseUrl, headers.kid);
  if (!jwks) {
    return recusa("JWKS indisponível");
  }

  const verified = verifyWebhookSignature({
    rawBody,
    headers,
    jwks,
    now: Date.now(),
  });

  if (!verified.ok) {
    return recusa(`assinatura rejeitada (${verified.reason})`);
  }

  /* Só o evento bloqueante é tratado. Se um dia outro for habilitado no
     console, ele recebe 200 sem efeito em vez de cair aqui dentro. */
  if (headers.eventType !== BEFORE_CREATE) {
    return Response.json({ received: true }, { status: 200 });
  }

  const decision = decideUserBeforeCreate(rawBody, allowedEmails);

  if (!decision.allowed) {
    return recusa("e-mail fora da allowlist");
  }

  console.log(
    `[webhook] cadastro liberado: ${maskEmailForLog(decision.email)}`,
  );

  return Response.json({ allowed: true }, { status: 200 });
}

/* GET, PUT, PATCH e DELETE não são exportados: o Next responde 405 e o
   endpoint não tem superfície além da entrega assinada. */
