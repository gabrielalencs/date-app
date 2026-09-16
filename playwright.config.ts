import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
/**
 * `localhost`, não `127.0.0.1`: o Neon Auth valida a origem contra uma lista de
 * confiáveis e responde 403 "Invalid origin" para o IP, mesmo na mesma porta.
 * Com o IP, o teste live acusaria login quebrado com a aplicação correta.
 */
const BASE_URL = `http://localhost:${PORT}`;

// Build de produção de propósito: o dev overlay do Next apareceria nas capturas.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  /**
   * Um worker, sempre. `fullyParallel: false` serializa dentro do arquivo, mas
   * continua abrindo um worker por arquivo — e aqui não há o que paralelizar:
   * existe **um** workspace de development e **uma** conta no Neon Auth. Dois
   * workers significam duas execuções mexendo nas mesmas fixtures (foi como o
   * B10 viu o calendário falhar em execução conjunta e passar sozinho) e logins
   * novos simultâneos, que o provedor passa a atender devagar até estourar os
   * 30 s da navegação.
   *
   * Paralelismo aqui não é ganho de tempo: é fonte de teste instável, que é
   * pior que teste ausente.
   */
  workers: 1,
  /* O teto do teste precisa ser maior que o da navegação que ele espera: com
     os 30 s padrão, a espera de 60 s do login nunca chegaria a acontecer. Os 86
     testes ficam abaixo de 7 s cada; este número só existe para o caso do Neon
     Auth demorar, e não para esconder lentidão da aplicação. */
  timeout: 90_000,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
