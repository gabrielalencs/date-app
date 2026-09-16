import type { NextConfig } from "next";

// reactCompiler fica desligado por decisão D-002: depende de Babel e encareceria o build antes de existir UI real para medir.

/**
 * Headers estáticos do B11 (seção 7 do docs/PWA_AND_HARDENING.md).
 *
 * A Content-Security-Policy **não** está aqui. Ela mora só no proxy.ts, porque
 * o nonce é por requisição — e porque dois headers de CSP são somados pelo
 * navegador, não substituídos: a política aplicada viraria a interseção das
 * duas, com um sintoma que não corresponde a nada escrito em nenhum dos dois
 * arquivos (D-132).
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // O produto tem coordenadas, mas digitadas: não usa a API de geolocalização.
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  {
    key: "Strict-Transport-Security",
    /* Sem `preload` na V1: entrar na lista do navegador é fácil e sair leva
       meses. Domínio novo não assume compromisso irreversível antes do primeiro
       deploy (D-134). */
    value: "max-age=63072000; includeSubDomains",
  },
  // Redundante com frame-ancestors 'none'; fica por navegador antigo.
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  // O header anuncia o framework e a versão sem contrapartida nenhuma.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
      {
        /* O script do service worker nunca pode ser cacheado: é por ele que o
           public/sw-kill.js chega ao navegador de quem já instalou. O padrão do
           navegador tende a isso, mas padrão não é garantia. */
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Content-Type", value: "text/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
