import { createNeonAuth } from "@neondatabase/auth/next/server";
import { NextResponse, type NextRequest } from "next/server";

import { parseAuthConfig } from "@/lib/auth/config";

/**
 * Camada OTIMISTA (D-032). Só decide navegação: redireciona quem não tem
 * cookie de sessão para /login. Não consulta workspace_members e não é
 * autoridade — o layout privado chama requireAuthorizedContext de novo, perto
 * dos dados. Os docs do Next pedem que o proxy não dependa de módulos
 * compartilhados, então ele monta a própria instância a partir do env puro.
 */
const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth",
  "/_next",
  "/favicon.ico",
  // Vitrine do design system: não lê dado nenhum e precisa abrir sem sessão
  // para o `pnpm shots` funcionar antes de existirem contas. Ver B11.
  "/kitchen-sink",
] as const;

/** Arquivo servido de public/: tem extensão e nunca é rota de produto. */
const FILE_REQUEST = /\.[a-zA-Z0-9]+$/;

function isPublic(pathname: string): boolean {
  if (FILE_REQUEST.test(pathname)) {
    return true;
  }

  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
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
      cookies: { secret: config.cookieSecret },
      logLevel: "silent",
    }).middleware({ loginUrl: "/login" });
  }

  return cachedMiddleware(request);
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  try {
    return await authMiddleware(request);
  } catch {
    /* Auth mal configurado não pode virar rota privada aberta: nega por
       redirecionamento em vez de estourar 500 e deixar passar. */
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
