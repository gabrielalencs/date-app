import { expect, test } from "./harness.ts";

/**
 * Fronteira HTTP da aplicação. Roda sem credencial e sem conta criada: prova o
 * que a aplicação nega por si, não o que o provedor faria.
 */
const PRIVATE_PATHS = [
  "/",
  "/ideias",
  "/agenda",
  "/memorias",
  "/novo",
  "/perfil",
];

/** Caminhos que o handler genérico do provedor encaminharia se fosse reexportado. */
const FORBIDDEN_AUTH = [
  { method: "POST" as const, path: "/api/auth/sign-up/email" },
  { method: "POST" as const, path: "/api/auth/sign-in/social" },
  { method: "POST" as const, path: "/api/auth/sign-in/magic-link" },
  { method: "POST" as const, path: "/api/auth/sign-in/email-otp" },
  { method: "POST" as const, path: "/api/auth/admin/create-user" },
  { method: "GET" as const, path: "/api/auth/admin/list-users" },
  { method: "POST" as const, path: "/api/auth/admin/set-role" },
  { method: "POST" as const, path: "/api/auth/admin/impersonate-user" },
  { method: "POST" as const, path: "/api/auth/delete-user" },
  { method: "POST" as const, path: "/api/auth/update-user" },
];

test("GET /login responde 200", async ({ request }) => {
  const response = await request.get("/login");
  expect(response.status()).toBe(200);
});

test("a tela de login não oferece criar conta", async ({ page }) => {
  await page.goto("/login");
  const html = (await page.content()).toLowerCase();

  expect(html).not.toContain("criar conta");
  expect(html).not.toContain("sign-up");
  expect(html).not.toContain("cadastre");
  expect(html).not.toContain("esqueci");
});

test("não existe página /auth/sign-up", async ({ request }) => {
  for (const path of ["/auth/sign-up", "/signup", "/cadastro"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).not.toBe(200);
  }
});

for (const path of PRIVATE_PATHS) {
  test(`rota privada ${path} sem cookie vai para /login`, async ({
    request,
  }) => {
    const response = await request.get(path, { maxRedirects: 0 });

    expect([302, 303, 307, 308]).toContain(response.status());
    expect(response.headers()["location"]).toContain("/login");
  });
}

for (const { method, path } of FORBIDDEN_AUTH) {
  test(`${method} ${path} é bloqueado antes do provedor`, async ({
    request,
  }) => {
    const response =
      method === "POST"
        ? await request.post(path, {
            data: {
              email: "intruso@example.invalid",
              password: "senha-que-nao-deve-criar-nada",
              name: "Intruso",
            },
            failOnStatusCode: false,
          })
        : await request.get(path, { failOnStatusCode: false });

    // 404 pela allowlist; nunca 2xx, que significaria alcançar o Neon.
    expect(response.status(), `${method} ${path}`).toBe(404);
  });
}

test("métodos de escrita não exportados respondem 405", async ({ request }) => {
  for (const path of ["/api/auth/sign-out", "/api/auth/get-session"]) {
    const response = await request.fetch(path, {
      method: "DELETE",
      failOnStatusCode: false,
    });
    expect(response.status(), path).toBe(405);
  }
});

test("a vitrine só existe sob a variável, e sem ela é 404 de verdade", async ({
  request,
}) => {
  const habilitada = process.env.DATE_ENABLE_KITCHEN_SINK === "true";
  const response = await request.get("/kitchen-sink", { maxRedirects: 0 });

  if (habilitada) {
    // Quando existe, precisa abrir sem sessão — é o que o pnpm shots usa.
    expect(response.status()).toBe(200);
  } else {
    // Sem a variável não é rota protegida: some (D-034).
    expect(response.status()).toBe(404);
  }
});

test("assets estáticos continuam públicos, sem passar por redirect", async ({
  request,
}) => {
  for (const asset of [
    "/brand/logos/logo_nome_dark_horizontal.svg",
    "/brand/logos/logo_nome_white_horizontal.svg",
  ]) {
    // maxRedirects: 0 é o que importa: seguir redirect esconderia o 307 do proxy.
    const response = await request.get(asset, { maxRedirects: 0 });

    expect(response.status(), asset).toBe(200);
    expect(response.headers()["content-type"], asset).toContain("svg");
  }
});

/**
 * Webhook `user.before_create` (B12, D-043).
 *
 * O que estes testes provam é o acoplamento, não a criptografia — essa está em
 * `tests/auth/webhook.test.ts`, contra assinatura de verdade. Aqui a pergunta é
 * outra: o proxy deixa a entrega chegar à rota, e a rota nega quando não
 * consegue verificar?
 *
 * O primeiro ponto é o que falha silencioso em produção. Se o proxy tratasse a
 * rota como privada, ela responderia um redirect para /login; o provedor leria
 * resposta inválida e, porque falha fechado, recusaria TODO cadastro — inclusive
 * o das duas contas reais, no dia do deploy.
 */
const WEBHOOK = "/api/webhooks/neon-auth";

test("o webhook do Neon Auth é alcançável sem cookie", async ({ request }) => {
  const response = await request.post(WEBHOOK, {
    data: { event_type: "user.before_create" },
    failOnStatusCode: false,
    maxRedirects: 0,
  });

  // Não pode ser redirect: quem chama é o provedor, e ele nunca terá sessão.
  expect([302, 303, 307, 308]).not.toContain(response.status());
  expect(response.status()).toBe(200);
});

test("entrega sem assinatura é recusada, e a recusa é 200", async ({
  request,
}) => {
  const response = await request.post(WEBHOOK, {
    data: {
      event_id: "evt",
      event_type: "user.before_create",
      user: { id: "x", email: "intruso@example.invalid" },
    },
    failOnStatusCode: false,
  });

  /* 200 é obrigatório: o provedor só LÊ a decisão em resposta 2xx. Um 401 aqui
     também barraria o cadastro, mas por falha de entrega, com retry — e a
     pessoa veria erro genérico em vez da recusa. */
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ allowed: false });
});

test("o webhook não expõe leitura nem escrita além do POST", async ({
  request,
}) => {
  for (const method of ["GET", "PUT", "PATCH", "DELETE"] as const) {
    const response = await request.fetch(WEBHOOK, {
      method,
      failOnStatusCode: false,
    });
    expect(response.status(), method).toBe(405);
  }
});
