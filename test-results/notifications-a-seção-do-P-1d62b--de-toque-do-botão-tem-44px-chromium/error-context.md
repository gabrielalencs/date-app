# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: notifications.spec.ts >> a seção do Perfil >> o alvo de toque do botão tem 44px
- Location: tests\e2e\notifications.spec.ts:183:7

# Error details

```
Test timeout of 90000ms exceeded.
```

```
Error: locator.boundingBox: Test timeout of 90000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Ativar notificações' })

```

# Page snapshot

```yaml
- generic [active] [ref=f1e1]:
  - generic [ref=f1e2]:
    - link "Pular para o conteúdo" [ref=f1e3] [cursor=pointer]:
      - /url: "#conteudo"
    - generic [ref=f1e4]:
      - link "date · Início" [ref=f1e5] [cursor=pointer]:
        - /url: /
        - img "date" [ref=f1e7]
      - link "Perfil" [ref=f1e8] [cursor=pointer]:
        - /url: /perfil
    - main [ref=f1e12]:
      - generic [ref=f1e13]:
        - generic [ref=f1e15]:
          - generic [ref=f1e16]: Seu espaço no DATE
          - heading "Perfil" [level=1] [ref=f1e17]
          - paragraph [ref=f1e18]: Um lugar para cuidar dos planos e do seu jeito de estar aqui.
        - generic [ref=f1e19]:
          - generic [ref=f1e20]:
            - generic [ref=f1e26]:
              - paragraph [ref=f1e27]: Um espaço para dois.
              - paragraph [ref=f1e28]: A vida de vocês, com mais planos juntos.
            - generic [ref=f1e29]:
              - term [ref=f1e30]: Papel
              - definition [ref=f1e31]: Proprietário
            - generic [ref=f1e35]:
              - heading "Do seu jeito" [level=2] [ref=f1e36]
              - paragraph [ref=f1e43]: Escolha o tema ou acompanhe a aparência do seu aparelho.
              - group "Tema" [ref=f1e44]:
                - button "Claro" [ref=f1e45] [cursor=pointer]
                - button "Escuro" [ref=f1e52] [cursor=pointer]
                - button "Sistema" [pressed] [ref=f1e55] [cursor=pointer]
            - generic [ref=f1e58]:
              - heading "Notificações" [level=2] [ref=f1e59]
              - paragraph [ref=f1e65]: As notificações estão bloqueadas nas configurações do navegador para este site. Para voltar a receber, libere por lá — o DATE não consegue pedir de novo.
            - generic [ref=f1e66]:
              - heading "Na tela de início" [level=2] [ref=f1e67]
              - paragraph [ref=f1e70]:
                - text: Dá para instalar o DATE como aplicativo. No Android, abra o menu do navegador e toque em
                - strong [ref=f1e71]: Instalar aplicativo
                - text: . No iPhone, toque em
                - strong [ref=f1e72]: Compartilhar
                - text: e depois em
                - strong [ref=f1e73]: Adicionar à Tela de Início
                - text: . No iPhone, o aplicativo instalado pede login uma vez, separado do Safari — é assim que o sistema funciona.
            - button "Sair" [ref=f1e76] [cursor=pointer]
          - generic [ref=f1e80]:
            - generic [ref=f1e81]:
              - img "Duas pessoas contemplam o litoral ao entardecer" [ref=f1e82]
              - paragraph [ref=f1e83]: Tempo de qualidade começa com presença.
            - paragraph [ref=f1e86]: Mais planos.Mais vida. Juntos.
    - navigation "Navegação principal" [ref=f1e94]:
      - list [ref=f1e95]:
        - listitem [ref=f1e96]:
          - link "Início" [ref=f1e97] [cursor=pointer]:
            - /url: /
        - listitem [ref=f1e102]:
          - link "Ideias" [ref=f1e103] [cursor=pointer]:
            - /url: /ideias
        - listitem [ref=f1e107]:
          - link "Novo DATE" [ref=f1e108] [cursor=pointer]:
            - /url: /novo
        - listitem [ref=f1e110]:
          - link "Agenda" [ref=f1e111] [cursor=pointer]:
            - /url: /agenda
        - listitem [ref=f1e115]:
          - link "Memórias" [ref=f1e116] [cursor=pointer]:
            - /url: /memorias
  - alert [ref=f1e123]
```

# Test source

```ts
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
  158 |       .toBeGreaterThan(0);
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
> 189 |     const caixa = await botao.boundingBox();
      |                               ^ Error: locator.boundingBox: Test timeout of 90000ms exceeded.
  190 |     expect(caixa!.height).toBeGreaterThanOrEqual(44);
  191 |   });
  192 | });
  193 | 
```