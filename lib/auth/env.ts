import "server-only";

import { parseAuthConfig, type AuthConfig } from "@/lib/auth/config";

let cachedConfig: AuthConfig | undefined;

export function getAuthConfig(): AuthConfig {
  cachedConfig ??= parseAuthConfig({
    NEON_AUTH_BASE_URL: process.env.NEON_AUTH_BASE_URL,
    NEON_AUTH_COOKIE_SECRET: process.env.NEON_AUTH_COOKIE_SECRET,
    ALLOWED_EMAILS: process.env.ALLOWED_EMAILS,
    DATE_OWNER_EMAIL: process.env.DATE_OWNER_EMAIL,
  });

  return cachedConfig;
}
