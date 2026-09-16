import { test as base, expect, type Page } from "@playwright/test";

/**
 * O arnês. Todo spec de navegador importa `test` daqui em vez de
 * `@playwright/test`, e com isso ganha, sem escrever nada, a auditoria da
 * seção 8 do docs/PWA_AND_HARDENING.md:
 *
 * - qualquer erro de console reprova;
 * - qualquer `pageerror` reprova;
 * - qualquer `securitypolicyviolation` reprova;
 * - qualquer resposta 4xx/5xx que o próprio teste não declarou reprova.
 *
 * É isto que faz a CSP ser verificada de graça em toda tela, toda vez, em vez
 * de uma vez na mão. Um teste que precisa de uma exceção chama `audit.allow()`
 * com o motivo escrito — exceção sem motivo é exceção que vira lista.
 */

/* Guarda de ambiente, igual à do seed e pelo mesmo motivo: esta suíte escreve
   no banco e sobe arquivo para o bucket. Roda na importação, antes de existir
   navegador, para falhar barulhento em vez de sujar a branch errada. */
const branch = process.env.NEON_BRANCH;
const bucket = process.env.R2_BUCKET;
if (branch !== "development") {
  throw new Error(
    `ABORTADO: NEON_BRANCH é "${branch ?? "(não definida)"}" e a suíte de ` +
      "navegador só roda contra development.",
  );
}
if (bucket !== undefined && bucket !== "date-media-dev") {
  throw new Error(
    `ABORTADO: R2_BUCKET é "${bucket}" e a suíte de navegador só roda contra ` +
      "date-media-dev.",
  );
}

export type AuditAllowance = { match: string; reason: string };

export type Audit = {
  /** Libera respostas cuja URL contenha `match`. O motivo vai no código. */
  allow: (match: string, reason: string) => void;
  /** Libera mensagens de console cujo texto contenha `match`. */
  allowConsole: (match: string, reason: string) => void;
};

type Problema = { kind: string; detail: string };

/**
 * A violação de CSP não chega por evento do Playwright: ela é um evento do DOM.
 * O listener é instalado como init script, então vale para toda navegação,
 * inclusive a primeira, e reporta pela função exposta.
 */
const CSP_LISTENER = `document.addEventListener("securitypolicyviolation", function (e) {
  try {
    window.__dateCspViolation(
      e.effectiveDirective + " bloqueou " + (e.blockedURI || "(inline)") +
      " em " + e.documentURI
    );
  } catch (_) {}
});`;

export const test = base.extend<{ audit: Audit }>({
  /* `auto` porque a auditoria não pode depender de o spec lembrar de pedir por
     ela: o valor do arnês está justamente em valer para os testes que foram
     escritos antes dele existir. */
  audit: [
    async ({ page }, use, testInfo) => {
      const problemas: Problema[] = [];
      const respostasLiberadas: AuditAllowance[] = [];
      const consoleLiberado: AuditAllowance[] = [];

      const audit: Audit = {
        allow: (match, reason) => respostasLiberadas.push({ match, reason }),
        allowConsole: (match, reason) =>
          consoleLiberado.push({ match, reason }),
      };

      await page.exposeFunction("__dateCspViolation", (detail: string) => {
        problemas.push({ kind: "securitypolicyviolation", detail });
      });
      await page.addInitScript(CSP_LISTENER);

      page.on("console", (message) => {
        if (message.type() !== "error") return;
        const texto = message.text();
        /* "Failed to load resource: ... 404" não traz a URL no texto: ela vem
           em `location()`. Sem olhar os dois, liberar a resposta não liberava o
           console que a mesma resposta produz, e o teste do 404 intencional
           precisaria de duas exceções para um único fato. */
        const origem = message.location().url;
        if (
          consoleLiberado.some((a) => texto.includes(a.match)) ||
          respostasLiberadas.some(
            (a) => texto.includes(a.match) || origem.includes(a.match),
          )
        ) {
          return;
        }
        problemas.push({
          kind: "console.error",
          detail: origem ? `${texto} (${origem})` : texto,
        });
      });

      page.on("pageerror", (error) => {
        problemas.push({ kind: "pageerror", detail: error.message });
      });

      page.on("response", (response) => {
        const status = response.status();
        if (status < 400) return;
        const url = response.url();
        if (respostasLiberadas.some((a) => url.includes(a.match))) return;
        problemas.push({ kind: `HTTP ${status}`, detail: url });
      });

      await use(audit);

      /* Só reprova quando o próprio teste passou: um teste que já falhou por
         outro motivo não precisa de um segundo erro por cima, que esconderia o
         primeiro. */
      if (testInfo.status === testInfo.expectedStatus && problemas.length > 0) {
        const lista = problemas
          .map((p) => `  - [${p.kind}] ${p.detail}`)
          .join("\n");
        throw new Error(
          `A página produziu ${problemas.length} ocorrência(s) que o arnês do ` +
            `B11 não aceita:\n${lista}`,
        );
      }
    },
    { auto: true },
  ],
});

export { expect, type Page };
