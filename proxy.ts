import { createNeonAuth } from "@neondatabase/auth/next/server";
import { NextResponse, type NextRequest } from "next/server";

import { parseAuthConfig, SESSION_DATA_TTL_SECONDS } from "@/lib/auth/config";

/**
 * Camada OTIMISTA (D-032). Só decide navegação: redireciona quem não tem
 * cookie de sessão para /login. Não consulta workspace_members e não é
 * autoridade — o layout privado chama requireAuthorizedContext de novo, perto
 * dos dados. Os docs do Next pedem que o proxy não dependa de módulos
 * compartilhados, então ele monta a própria instância a partir do env puro.
 *
 * Desde o B11 ele também é o dono único da Content-Security-Policy, porque o
 * nonce é por requisição e porque dois headers de CSP são somados pelo
 * navegador, não substituídos (D-132).
 */
const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth",
  "/_next",
  "/favicon.ico",
  /* Superfície da PWA. Todos já passariam pela regra de extensão abaixo; estão
     nomeados porque o navegador busca os três **sem credenciais** e um redirect
     para /login aqui tira a instalação do ar sem nenhum erro visível (seção 6
     do docs/PWA_AND_HARDENING.md). */
  "/manifest.webmanifest",
  "/sw.js",
  "/offline.html",
  "/apple-touch-icon.png",
] as const;

/**
 * A vitrine do design system não lê dado nenhum e precisa abrir sem sessão para
 * `pnpm shots` funcionar antes de existirem contas. A exceção passa a valer
 * somente quando a rota existe: com DATE_ENABLE_KITCHEN_SINK desligado a página
 * responde 404 e o proxy não a conhece (D-135).
 */
const KITCHEN_SINK = "/kitchen-sink";

/** Arquivo servido de public/: tem extensão e nunca é rota de produto. */
const FILE_REQUEST = /\.[a-zA-Z0-9]+$/;

function isPublic(pathname: string): boolean {
  if (FILE_REQUEST.test(pathname)) {
    return true;
  }

  if (
    process.env.DATE_ENABLE_KITCHEN_SINK === "true" &&
    (pathname === KITCHEN_SINK || pathname.startsWith(`${KITCHEN_SINK}/`))
  ) {
    return true;
  }

  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * O host do R2, para o connect-src. O upload é um PUT assinado que sai do
 * browser direto para o bucket (docs/MEDIA_R2.md seção 2); com connect-src
 * 'self' ele é bloqueado e o sintoma é uma foto que não sobe.
 *
 * O valor vem de R2_ENDPOINT, no servidor, na montagem do header. Nenhuma
 * variável nova e nada de NEXT_PUBLIC_: o host já aparece no cliente dentro da
 * URL assinada, e é o único lugar em que aparece.
 */
function r2Origin(): string {
  const endpoint = process.env.R2_ENDPOINT;
  if (!endpoint) return "";
  try {
    return new URL(endpoint).origin;
  } catch {
    return "";
  }
}

/** Política das rotas de API: elas devolvem JSON ou bytes, nunca documento. */
const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";

/**
 * Política dos documentos. Começou em `default-src 'none'` e cada diretiva
 * abaixo entrou por violação observada na suíte Playwright, não por previsão —
 * o relatório do B11 traz a violação que justificou cada uma.
 *
 * 'unsafe-inline' em style-src é compromisso declarado (D-133): o Next e o
 * next/font injetam estilo inline e resolver isso por hash a cada build é caro
 * e frágil. Em script-src, onde importaria, ele não está.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function documentCsp(nonce: string, hostname: string): string {
  const r2 = r2Origin();
  const isDev = process.env.NODE_ENV === "development";

  /* `upgrade-insecure-requests` numa origem http de localhost faz o navegador
     tentar https no mesmo host e devolver ERR_SSL_PROTOCOL_ERROR — medido na
     suíte de logout do B11, que segue redirecionamento absoluto. Numa origem
     local a diretiva não protege de nada, porque já é origem confiável; então
     ela entra em todo lugar, menos ali. */
  const local = LOCAL_HOSTS.has(hostname);

  return [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${r2 ? ` ${r2}` : ""}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    ...(local ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

let cachedMiddleware:
  ((request: NextRequest) => Promise<NextResponse>) | undefined;

function authMiddleware(request: NextRequest) {
  if (!cachedMiddleware) {
    const config = parseAuthConfig({
      NEON_AUTH_BASE_URL: process.env.NEON_AUTH_BASE_URL,
      NEON_AUTH_COOKIE_SECRET: process.env.NEON_AUTH_COOKIE_SECRET,
      ALLOWED_EMAILS: process.env.ALLOWED_EMAILS,
      DATE_OWNER_EMAIL: process.env.DATE_OWNER_EMAIL,
    });

    cachedMiddleware = createNeonAuth({
      baseUrl: config.baseUrl,
      cookies: {
        secret: config.cookieSecret,
        /* Tem que ser o mesmo valor do `lib/auth/server.ts`. O pacote lê
           `sessionDataTtl` no middleware **e** no route handler; com valores
           diferentes, os dois discordam sobre quando o dado da sessão venceu, e
           o sintoma seria exatamente um ricochete para /login sem erro. */
        sessionDataTtl: SESSION_DATA_TTL_SECONDS,
      },
      logLevel: "silent",
    }).middleware({ loginUrl: "/login" });
  }

  return cachedMiddleware(request);
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  /* API responde com a política mínima e não precisa de nonce: não há
     documento, não há script. Uma só, aqui, para não somar com outra escrita na
     própria rota. */
  if (pathname.startsWith("/api/")) {
    const response = isPublic(pathname)
      ? NextResponse.next()
      : await runAuth(request);
    response.headers.set("Content-Security-Policy", API_CSP);
    return response;
  }

  /* O nonce precisa chegar ao renderizador pelos headers da requisição: é dali
     que o Next extrai o `'nonce-...'` e o aplica aos scripts do framework e aos
     bundles da página. Confirmado em
     node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md. */
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = documentCsp(nonce, request.nextUrl.hostname);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = isPublic(pathname)
    ? NextResponse.next({ request: { headers: requestHeaders } })
    : await runAuth(request, requestHeaders);

  response.headers.set("Content-Security-Policy", csp);
  return response;
}

async function runAuth(
  request: NextRequest,
  requestHeaders?: Headers,
): Promise<NextResponse> {
  let authResponse: NextResponse;

  try {
    authResponse = await authMiddleware(request);
  } catch {
    /* Auth mal configurado não pode virar rota privada aberta: nega por
       redirecionamento em vez de estourar 500 e deixar passar. */
    return NextResponse.redirect(new URL("/login", request.url));
  }

  /* Sem nonce a pedir (rotas de API) ou quando a decisão foi mandar embora, a
     resposta do provedor vale como está. */
  if (!requestHeaders || isRedirect(authResponse)) {
    return authResponse;
  }

  /* Quando o provedor deixa passar, ele devolve a própria continuação — que não
     carrega a sobrescrita de headers da requisição. Sem reconstruí-la, o
     renderizador não vê o `x-nonce`, o Next não assina script nenhum e a página
     fica em branco sob `strict-dynamic`. Reconstruímos preservando o que o
     provedor escreveu, que na prática é o cookie de sessão renovado. */
  const passthrough = NextResponse.next({
    request: { headers: requestHeaders },
  });

  for (const cookie of authResponse.headers.getSetCookie()) {
    passthrough.headers.append("set-cookie", cookie);
  }
  authResponse.headers.forEach((value, key) => {
    if (key === "set-cookie" || key.startsWith("x-middleware-")) return;
    passthrough.headers.set(key, value);
  });

  return passthrough;
}

function isRedirect(response: NextResponse): boolean {
  return response.status >= 300 && response.status < 400;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
