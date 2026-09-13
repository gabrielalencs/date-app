import "server-only";

import { createNeonAuth, type NeonAuth } from "@neondatabase/auth/next/server";

import { SESSION_DATA_TTL_SECONDS } from "@/lib/auth/config";
import { getAuthConfig } from "@/lib/auth/env";

let authInstance: NeonAuth | undefined;

/** Instância lazy para o build não exigir segredos live durante análise estática. */
export function getAuth(): NeonAuth {
  const config = getAuthConfig();
  authInstance ??= createNeonAuth({
    baseUrl: config.baseUrl,
    cookies: {
      secret: config.cookieSecret,
      // Mesmo valor do proxy.ts, por construção (lib/auth/config.ts).
      sessionDataTtl: SESSION_DATA_TTL_SECONDS,
    },
    logLevel: "silent",
  });

  return authInstance;
}
