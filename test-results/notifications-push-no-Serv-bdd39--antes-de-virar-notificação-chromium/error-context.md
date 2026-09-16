# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: notifications.spec.ts >> push no Service Worker >> o texto do payload é truncado antes de virar notificação
- Location: tests\e2e\notifications.spec.ts:144:7

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - generic [ref=e3]:
      - img "Duas pessoas contemplam o litoral ao entardecer" [ref=e4]
      - img "date" [ref=e6]
      - generic [ref=e7]:
        - paragraph [ref=e8]: Mais planos.Mais vida.Juntos.
        - paragraph [ref=e10]: Experiências de hoje,memórias para sempre.
    - generic [ref=e12]:
      - generic [ref=e13]:
        - generic [ref=e14]: O espaço de vocês
        - heading "Que bom ter você por aqui." [level=1] [ref=e15]: Que bom tervocê por aqui.
        - paragraph [ref=e16]: Entre para continuar os planos de vocês.
      - generic [ref=e17]:
        - generic [ref=e18]:
          - generic [ref=e19]: E-mail
          - textbox "E-mail" [ref=e25]:
            - /placeholder: voce@exemplo.com
        - generic [ref=e26]:
          - generic [ref=e27]: Senha
          - textbox "Senha" [ref=e34]
        - button "Entrar" [ref=e35] [cursor=pointer]
      - generic [ref=e38]:
        - paragraph [ref=e39]: Um espaço privado, feito para dois.
        - group "Tema" [ref=e45]:
          - button "Claro" [ref=e46] [cursor=pointer]
          - button "Escuro" [ref=e53] [cursor=pointer]
          - button "Sistema" [pressed] [ref=e56] [cursor=pointer]
  - alert [ref=e59]
```

# Test source

```ts
  58  |     },
  59  |     lidas: async () =>
  60  |       page.evaluate(async () => {
  61  |         const registro = await navigator.serviceWorker.ready;
  62  |         const notificacoes = await registro.getNotifications();
  63  |         return notificacoes.map((n) => ({
  64  |           title: n.title,
  65  |           body: n.body,
  66  |           tag: n.tag,
  67  |           url: (n.data as { url?: string } | null)?.url ?? "",
  68  |         }));
  69  |       }),
  70  |   };
  71  | }
  72  | 
  73  | test.describe("push no Service Worker", () => {
  74  |   test.use({ permissions: ["notifications"] });
  75  | 
  76  |   test("um payload válido vira notificação com ícone, badge e link interno", async ({
  77  |     page,
  78  |   }) => {
  79  |     const worker = await prepararWorker(page);
  80  | 
  81  |     await worker.entregar({
  82  |       title: "Agora tem data",
  83  |       body: "“Jantar no Centro” está planejado para sábado.",
  84  |       url: "/planos/22222222-0000-4000-8000-000000000001",
  85  |       kind: "date_confirmed",
  86  |     });
  87  | 
  88  |     await expect
  89  |       .poll(async () => (await worker.lidas()).length)
  90  |       .toBeGreaterThan(0);
  91  | 
  92  |     const [notificacao] = await worker.lidas();
  93  |     expect(notificacao!.title).toBe("Agora tem data");
  94  |     expect(notificacao!.body).toContain("Jantar no Centro");
  95  |     expect(notificacao!.url).toBe(
  96  |       "/planos/22222222-0000-4000-8000-000000000001",
  97  |     );
  98  |     /* A tag é o que faz a segunda notificação do mesmo assunto substituir a
  99  |        primeira na bandeja em vez de empilhar. */
  100 |     expect(notificacao!.tag).toContain("date_confirmed");
  101 |   });
  102 | 
  103 |   test("URL externa no payload é descartada, nunca seguida", async ({
  104 |     page,
  105 |   }) => {
  106 |     const worker = await prepararWorker(page);
  107 | 
  108 |     for (const url of [
  109 |       "https://evil.example/roubo",
  110 |       "//evil.example/roubo",
  111 |       "javascript:alert(1)",
  112 |     ]) {
  113 |       await worker.entregar({
  114 |         title: `Teste ${url}`,
  115 |         body: "corpo",
  116 |         url,
  117 |         kind: "plan_created",
  118 |       });
  119 |     }
  120 | 
  121 |     await expect.poll(async () => (await worker.lidas()).length).toBe(3);
  122 | 
  123 |     /* Todas caem para a raiz: o worker monta o destino a partir do que
  124 |        reconhece, e o que não reconhece não vira navegação. */
  125 |     for (const notificacao of await worker.lidas()) {
  126 |       expect(notificacao.url).toBe("/");
  127 |     }
  128 |   });
  129 | 
  130 |   test("payload malformado falha em silêncio, sem notificação e sem erro", async ({
  131 |     page,
  132 |   }) => {
  133 |     const worker = await prepararWorker(page);
  134 | 
  135 |     await worker.entregar("isto não é json");
  136 |     await worker.entregar({ body: "sem título", url: "/" });
  137 |     await worker.entregar({ title: "", body: "título vazio" });
  138 | 
  139 |     /* Nada é exibido, e o arnês do B11 reprovaria qualquer `pageerror` que o
  140 |        handler tivesse deixado escapar. */
  141 |     expect(await worker.lidas()).toHaveLength(0);
  142 |   });
  143 | 
  144 |   test("o texto do payload é truncado antes de virar notificação", async ({
  145 |     page,
  146 |   }) => {
  147 |     const worker = await prepararWorker(page);
  148 | 
  149 |     await worker.entregar({
  150 |       title: "T".repeat(500),
  151 |       body: "B".repeat(2000),
  152 |       url: "/",
  153 |       kind: "plan_created",
  154 |     });
  155 | 
  156 |     await expect
  157 |       .poll(async () => (await worker.lidas()).length)
> 158 |       .toBeGreaterThan(0);
      |        ^ Error: expect(received).toBeGreaterThan(expected)
  159 | 
  160 |     const [notificacao] = await worker.lidas();
  161 |     expect(notificacao!.title.length).toBe(120);
  162 |     expect(notificacao!.body.length).toBe(300);
  163 |   });
  164 | });
  165 | 
  166 | test.describe("a seção do Perfil", () => {
  167 |   test("mostra um estado humano e não pede permissão sozinha", async ({
  168 |     page,
  169 |   }) => {
  170 |     await signInForFeature(page, account);
  171 |     await page.goto("/perfil");
  172 | 
  173 |     const secao = page.getByRole("heading", { name: "Notificações" });
  174 |     await expect(secao).toBeVisible();
  175 | 
  176 |     /* Sem permissão concedida, o que aparece é o convite — nunca o prompt do
  177 |        sistema, que só pode nascer de um clique. */
  178 |     await expect(
  179 |       page.getByRole("button", { name: "Ativar notificações" }),
  180 |     ).toBeVisible();
  181 |   });
  182 | 
  183 |   test("o alvo de toque do botão tem 44px", async ({ page }) => {
  184 |     await page.setViewportSize({ width: 390, height: 844 });
  185 |     await signInForFeature(page, account);
  186 |     await page.goto("/perfil");
  187 | 
  188 |     const botao = page.getByRole("button", { name: "Ativar notificações" });
  189 |     const caixa = await botao.boundingBox();
  190 |     expect(caixa!.height).toBeGreaterThanOrEqual(44);
  191 |   });
  192 | });
  193 | 
```