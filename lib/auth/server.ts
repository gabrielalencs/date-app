import "server-only";

import { createNeonAuth, type NeonAuth } from "@neondatabase/auth/next/server";

import { getAuthConfig } from "@/lib/auth/env";

let authInstance: NeonAuth | undefined;

/** Instância lazy para o build não exigir segredos live durante análise estática. */
export function getAuth(): NeonAuth {
  const config = getAuthConfig();
  authInstance ??= createNeonAuth({
    baseUrl: config.baseUrl,
    cookies: {
      secret: config.cookieSecret,
      sessionDataTtl: 300,
    },
    logLevel: "silent",
  });

  return authInstance;
}
