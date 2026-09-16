# DATE — PWA e endurecimento

Documento normativo do B11.

---

## 1. Princípio

Este é o primeiro bloco que não acrescenta funcionalidade. Nada do que está aqui aparece numa lista de recursos, e é exatamente por isso que ele é o bloco mais fácil de declarar pronto sem estar.

O B11 faz três coisas:

- transforma o site em aplicativo instalado — manifest, ícones, área segura, barra de status, e a tela abrindo do ícone sem barra de navegador;
- fecha a superfície: headers, política de conteúdo, caminhos públicos, e o que o `proxy.ts` deixa passar;
- troca "verifiquei" por número — Playwright nos fluxos que não podem quebrar, axe nas telas, bytes medidos em vez de estimados.

A régua do bloco inteiro é a seção 5 do `docs/DEFINITION_OF_DONE.md`, endurecida: aqui não existe afirmação sem saída colada. "A CSP está correta" não é uma frase verificável. "As rotas carregam com zero `securitypolicyviolation`, saída abaixo" é.

E o B12 não tem margem para consertar nada disto. Depois dele existe dado real de duas pessoas em `production`.

---

## 2. A armadilha: o primeiro código que sobrevive ao logout

Até aqui, tudo que o DATE escreveu morava em Neon, em R2 ou na memória de uma aba. O service worker é diferente em três aspectos, e os três são perigosos:

- sobrevive ao fechamento da aba e roda sem página aberta;
- sobrevive ao logout — ele não sabe o que é sessão;
- sobrevive ao deploy, e não é revertido por `git revert`. O navegador de quem já instalou continua com o service worker antigo até ele próprio decidir buscar um novo.

Junte isso ao produto: as fotos privadas do casal chegam por `/api/media/[id]`, uma rota GET autenticada que devolve bytes com `Cache-Control: private`. Qualquer receita pronta de PWA — `next-pwa`, um Workbox copiado de tutorial, um `runtimeCaching` com `strategy: 'CacheFirst'` para imagens — vai gravar essas fotos no Cache Storage do dispositivo, onde elas ficam:

- legíveis sem cookie, porque o Cache Storage não tem noção de sessão;
- presentes depois do logout, porque `auth.signOut()` invalida o cookie e não toca em cache;
- presentes depois do próximo login de outra pessoa no mesmo dispositivo.

Isso é a única falha de segurança que este projeto consegue introduzir sem escrever uma query errada. O `docs/MEDIA_R2.md` seção 6 já reduziu o prazo do cache HTTP de um ano para sete dias exatamente por esse motivo — e o cache HTTP ao menos respeita `private` e é despejado pelo navegador. Cache Storage não é despejado, é programado.

### A regra

**O service worker do DATE nunca chama `cache.put()` sobre uma resposta autenticada. Nunca.**

O que ele cacheia, em toda a V1, é um arquivo: `/offline.html`. Estático, sem dado, sem marca de pessoa, pré-cacheado na instalação e servido apenas quando uma navegação falha por rede.

Todo o resto passa direto: `fetch(event.request)`, sem `caches.match`, sem estratégia, sem exceção para "só os ícones", "só as fontes", "só o CSS". A economia disso é irrelevante — o Next já versiona os assets com hash e `immutable`, e o cache HTTP do navegador já faz esse trabalho sem escrever uma linha.

### Sem biblioteca

Nem `next-pwa`, nem `@ducanh2912/next-pwa`, nem Workbox. A stack é fechada (`CLAUDE.md`), e nenhuma dessas dependências se justifica para trinta linhas de código que precisam ser lidas inteiras por uma pessoa antes de irem para o ar. Uma biblioteca cujo comportamento padrão é cachear é a ferramenta errada para uma regra cujo conteúdo é "não cacheie".

### O botão de emergência

O service worker é a única coisa neste projeto que não se desfaz por deploy. Então a saída precisa existir antes de ser necessária, e precisa estar escrita:

`public/sw-kill.js` contém a versão que se desregistra:

```js
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", async () => {
  await caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k))));
  await self.registration.unregister();
  const cs = await self.clients.matchAll({ type: "window" });
  cs.forEach((c) => c.navigate(c.url));
});
```

Em caso de problema, o conteúdo desse arquivo substitui o de `public/sw.js` e um deploy resolve. Isso só funciona se o script do service worker nunca for cacheado: `Cache-Control: no-cache` explícito em `/sw.js`, além do comportamento padrão do navegador, que não é garantia de nada.

O caminho de emergência é testado no B11, não descoberto no B12: registre, troque pelo kill, confirme que desregistrou.

---

## 3. Manifest

Rota do App Router, não arquivo estático — o manifest precisa de variáveis e de um lugar só. Confirme a API atual em `node_modules/next/dist/docs/` antes de escrever; não escreva de memória.

| Campo | Valor | Por quê |
|---|---|---|
| `id` | `/` | Fixo desde o primeiro deploy. É a identidade da instalação. Se um dia `start_url` mudar sem `id`, o navegador entende como um app diferente e a pessoa acaba com dois DATEs na tela inicial |
| `name` | `DATE` | |
| `short_name` | `DATE` | 12 caracteres é o teto prático abaixo do ícone no Android |
| `description` | uma frase, a do `README.md` | |
| `start_url` | `/` | |
| `scope` | `/` | |
| `display` | `standalone` | seção 4.19 do spec |
| `orientation` | ausente | não travar em retrato. Travar orientação quebra quem usa o telefone em suporte fixo, e é problema de acessibilidade, não preferência estética |
| `lang` | `pt-BR` | |
| `dir` | `ltr` | |
| `background_color` | `#FBF7F2` | a splash do Android usa este valor, sempre, independentemente do tema do sistema. Não existe splash escura; escolher o cream é a decisão consciente |
| `theme_color` | `#FBF7F2` | e a variante escura vai por `meta`, não por manifest — ver abaixo |
| `icons` | seção 4 | |

`shortcuts` (atalho para `/novo` no toque longo do ícone) fica abaixo da linha de corte. É bom e é barato, mas não é o bloco.

### `theme_color` nos dois temas

O manifest aceita um valor só. A barra de status do app instalado segue o `<meta name="theme-color">`, que aceita `media`:

```html
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#FBF7F2">
<meta name="theme-color" media="(prefers-color-scheme: dark)"  content="#0E171D">
```

Os dois valores são `--bg` de cada tema em `app/globals.css`. HEX aqui é a exceção sancionada à regra do design system, porque `meta` não lê variável CSS — e por isso os dois valores precisam de um comentário apontando para o token de origem, senão eles divergem na primeira vez que a paleta mudar.

**Ponto aberto:** o tema do DATE é light/dark/system, resolvido pelo `ThemeProvider`. A `media` acima segue o sistema, não a escolha da pessoa. Quem usa sistema claro e DATE escuro vai ver uma barra de status clara sobre uma interface escura. Corrigir isso exige escrever o `content` do `meta` pelo mesmo script que evita o flash de tema. Faça, se for barato; se não for, reporte a divergência em vez de deixá-la em silêncio.

---

## 4. Ícones

Os arquivos já existem em `public/brand/icons/`, vindos do pacote inicial. **Auditar, não regerar.** Abra cada um, meça, e só produza arquivo novo onde a medida reprovar.

| Arquivo | Medida obrigatória |
|---|---|
| 192×192 `any` | quadrado exato, PNG |
| 512×512 `any` | quadrado exato, PNG |
| 512×512 `maskable` | arquivo próprio, ver abaixo |
| `apple-touch-icon` 180×180 | **sem canal alfa**: o iOS compõe preto atrás de transparência e o símbolo navy some |
| `favicon.ico` | 32 e 16 no mesmo arquivo |

### O maskable não é o 512 renomeado

O Android recorta o ícone maskable em círculo, losango ou squircle, conforme o fabricante. A zona segura é um círculo de 80% da largura centrado — tudo fora dela pode ser cortado em algum aparelho.

O ícone atual tem o símbolo ocupando praticamente a largura inteira sobre o fundo areia. Recortado em círculo, as pontas do calendário saem. Então o maskable é um desenho próprio: mesmo símbolo, menor, centrado, sobre fundo areia sólido de borda a borda, com o traço inteiro dentro dos 80% centrais.

Declare os dois como entradas separadas no manifest. Nunca `purpose: "any maskable"` no mesmo arquivo: isso afirma que o mesmo desenho funciona nas duas situações, e ele não funciona.

**Verificação:** sobreponha o círculo de 80% à imagem e olhe. A alternativa é descobrir no aparelho de outra pessoa.

---

## 5. Área segura e comportamento de app instalado

`viewport-fit=cover` é o que faz `env(safe-area-inset-*)` devolver alguma coisa. Sem ele, `env()` devolve zero e não avisa — o CSS parece certo, passa em toda captura de tela, e a barra inferior fica embaixo do indicador de gestos só no aparelho de verdade.

- viewport com `viewportFit: "cover"`;
- barra inferior com `padding-bottom: env(safe-area-inset-bottom)`, **somado** ao padding próprio, não substituindo;
- `apple-mobile-web-app-status-bar-style: default`. `black-translucent` estende o conteúdo sob a barra de status e obriga `env(safe-area-inset-top)` em todo cabeçalho, para ganhar alguns pixels. Não compensa;
- `maximum-scale` e `user-scalable=no` são **proibidos**. Impedir zoom é falha de acessibilidade, e é o atalho clássico para "evitar o zoom do teclado no iOS" — que o design system já resolveu do jeito certo, com fonte de 16px nos campos;
- não desligar o puxar-para-atualizar do Android. É gesto do sistema e as pessoas o usam;
- estilos exclusivos de app instalado, se existirem, ficam em `@media (display-mode: standalone)`.

### O que só um aparelho responde

Três coisas não têm como ser verificadas em navegador de desktop, em emulação de dispositivo do DevTools ou em Playwright:

- a área segura de verdade num aparelho com recorte ou barra de gestos;
- a cor da barra de status no app instalado;
- o iOS instalado tem cookie jar separado do Safari. Quem estiver logado no Safari vai precisar logar de novo dentro do app instalado. Isso não é defeito — é comportamento do sistema, e precisa estar escrito aqui para ninguém "consertar" mexendo em cookie.

Essas três viram **lista de verificação do proprietário** no relatório, com o texto do que ele precisa olhar. O agente não afirma que funcionam.

---

## 6. O caminho público

O `docs/AUTH_AND_SECURITY.md` seção 7 lista o que o `proxy.ts` deixa passar sem cookie. O B11 audita essa lista inteira, e ela cresce com a PWA.

### O manifest não é buscado com o seu cookie

Esta é a segunda armadilha do bloco, e ela é silenciosa: o navegador busca o manifest **sem credenciais**, a menos que o `<link rel="manifest">` traga `crossorigin="use-credentials"`. Se o `proxy.ts` redirecionar essa requisição para `/login`, o navegador recebe HTML onde esperava JSON, e a instalação simplesmente não é oferecida — sem erro visível, sem log, sem nada na tela.

O mesmo vale para `/sw.js`, para os ícones e para o `apple-touch-icon`.

### A tabela que precisa ser provada

Cada linha verificada com uma requisição **sem cookie nenhum**, e a resposta colada:

| Caminho | Esperado |
|---|---|
| `/manifest.webmanifest` | 200, `application/manifest+json` |
| `/sw.js` | 200, `text/javascript`, `Cache-Control: no-cache` |
| `/offline.html` | 200 |
| ícones e `apple-touch-icon` | 200, `image/png` |
| `/favicon.ico` | 200 |
| `/login` | 200 |
| `/` | 307/302 para `/login` |
| `/planos/{uuid-que-existe}` | 307/302 para `/login`, nunca 200 |
| `/api/media/{id-que-existe}` | não 200, e o corpo não são os bytes |

### A regra da extensão

`proxy.ts` libera "qualquer caminho com extensão de arquivo". Isso é uma regra **por forma**, não por rota: qualquer caminho que contenha um ponto atravessa o proxy.

Não é uma falha por si — o proxy é camada otimista (D-032) e `requireAuthorizedContext()` é a autoridade. Mas o B11 tem que **provar** que é inofensiva: enumere toda rota da aplicação cujo caminho possa conter um ponto, e mostre que cada uma resolve o contexto por conta própria. Se alguma não resolver, ela é o achado mais importante do bloco.

### `/kitchen-sink`

O `docs/AUTH_AND_SECURITY.md` marcou a exceção pública como "reavaliar no B11". Reavaliada:

A rota continua condicionada a `DATE_ENABLE_KITCHEN_SINK`, e **a exceção no `proxy.ts` passa a ser condicionada à mesma variável**. Com a variável desligada, a rota responde 404 e o proxy não a conhece.

Uma exceção pública permanente para uma rota que só existe em desenvolvimento é a exceção que alguém esquece. Agora ela some junto com a rota.

---

## 7. Headers

### O método, antes da lista

Uma CSP copiada de blog é uma CSP que você não entende, e ninguém descobre isso até a tela ficar branca no telefone de outra pessoa. Então:

1. comece do mais fechado que existe, `default-src 'none'`;
2. rode toda a suíte Playwright com a política **em modo de aplicação**;
3. o arnês de teste falha em qualquer `securitypolicyviolation`;
4. cada diretiva que entrar na política entra **por violação observada**, com a violação colada ao lado no relatório.

A CSP final não é a lista abaixo. É o que a medição devolver. A lista abaixo é a previsão, e onde ela divergir do medido, vale o medido — e a divergência é reportada.

### A previsão

```text
default-src 'none';
script-src 'self' 'nonce-{N}' 'strict-dynamic';
style-src 'self' 'unsafe-inline';
img-src 'self' blob: data:;
font-src 'self';
connect-src 'self' {HOST_R2};
manifest-src 'self';
worker-src 'self';
form-action 'self';
frame-ancestors 'none';
base-uri 'self';
object-src 'none';
upgrade-insecure-requests;
```

Três pontos que não são óbvios e que quebram funcionalidade real se saírem:

- **`connect-src` com o host do R2.** O upload é PUT assinado direto do browser para o R2 (`docs/MEDIA_R2.md` seção 2). Com `connect-src 'self'`, ele é bloqueado — e o sintoma é uma foto que não sobe, num fluxo que o teste em Node não percorre. O host sai de `R2_ENDPOINT`, no servidor, na montagem do header. Nenhuma variável nova, e nada de `NEXT_PUBLIC_`: o valor já aparece no cliente dentro da URL assinada, e é o único lugar em que aparece;
- **`img-src blob:`.** O cliente reduz e reencoda a imagem antes de subir; a prévia vem de `URL.createObjectURL`. Sem `blob:`, a prévia some;
- **`style-src 'unsafe-inline'`.** Compromisso consciente: o Next e o `next/font` injetam estilo inline, e resolver isso com hash por build é caro e frágil. Fica declarado aqui como decisão, não como descuido. `script-src` é onde `'unsafe-inline'` importaria, e lá ele não está.

### O nonce e o script do tema

O `ThemeProvider` tem um script inline que evita o flash de tema. Com `strict-dynamic`, `'self'` é ignorado pelos navegadores que o suportam: todo script precisa do nonce, inclusive os do próprio Next.

O nonce é gerado por requisição no `proxy.ts`. Verifique em `node_modules/next/dist/docs/` como a versão instalada propaga o nonce para os scripts do framework — a mecânica muda entre versões e escrever de memória aqui produz uma tela branca. Confirme também o custo: nonce por requisição costuma forçar renderização dinâmica. Neste produto isso é quase gratuito, porque toda página autenticada já é dinâmica; se `/login` for a exceção, diga qual o efeito medido em vez de supor.

### Dois headers de CSP são somados, não substituídos

Se `next.config.ts` declarar uma CSP e o `proxy.ts` declarar outra, o navegador aplica a **interseção** das duas. O resultado é uma política mais restritiva do que qualquer uma das duas, com um sintoma que não corresponde a nada escrito em nenhum dos dois arquivos.

Então: **CSP mora em um lugar só** — o `proxy.ts`, porque o nonce é por requisição. Os headers estáticos ficam em `next.config.ts`. Nenhum dos dois toca no território do outro, e isso é verificado contando os headers `content-security-policy` numa resposta real.

### Os estáticos

| Header | Valor | Observação |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` | o produto tem coordenadas, mas digitadas — não usa a API de geolocalização |
| `Cross-Origin-Opener-Policy` | `same-origin` | |
| `Cross-Origin-Resource-Policy` | `same-origin` | |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | sem `preload` na V1. Preload entra numa lista de navegador e sair dela leva meses. Domínio novo não entra em compromisso irreversível antes do primeiro deploy |
| `X-Frame-Options` | `DENY` | redundante com `frame-ancestors`, mantido por navegador antigo |

### A rota de mídia merece os seus

`/api/media/[id]` é a única rota do produto que devolve bytes que uma pessoa subiu. Ela recebe, além dos gerais:

- `Content-Security-Policy: default-src 'none'` na própria resposta — se algum dia um content-type escapar, o conteúdo não executa nada;
- `X-Content-Type-Options: nosniff`;
- `Content-Disposition: inline`;
- revalidação do content-type contra a allowlist do `docs/MEDIA_R2.md` seção 5 **na leitura**, não só na gravação. Custa uma comparação de string e fecha o caso do valor que entrou antes de a allowlist existir.

E o `Cache-Control: private, max-age=604800, immutable` que já está lá é conferido numa resposta real, com `curl`, não lido no código.

---

## 8. Playwright nos fluxos críticos

O D-008 adiou o Playwright para este bloco e o D-015 antecipou um pedaço para capturas. Agora ele passa a ser o que foi prometido.

### O que é crítico

Seis fluxos. Não são "os que dão mais trabalho", são os que, quebrados, tornam o produto inutilizável ou inseguro:

1. **Entrar e sair.** Login com credencial correta, sessão persistindo entre navegações, logout invalidando de verdade — voltar no histórico depois do logout não mostra conteúdo;
2. **A porta fechada.** Rota privada sem cookie redireciona; e-mail fora da allowlist é recusado com a mensagem única; a superfície do provedor fora das três operações responde 404;
3. **O ciclo central.** Criar plano → sugerir data → votar com as duas contas → confirmar → status vai para `planned`;
4. **O acoplamento do status.** Confirmar reserva leva a `reserved`; desfazer traz de volta; o botão de status recusa o movimento que contradiz o fato;
5. **A foto.** Upload real contra `date-media-dev`, exibição pela rota autenticada, remoção — e a mídia de outro workspace responde não encontrado;
6. **A travessia.** Marcar como realizado com a pré-condição satisfeita, avaliar, e a memória aparecendo em `/memorias`.

Muito disso já existe espalhado em `test:auth`, `test:http`, `test:crud`, `test:dates`, `test:media-e2e`, `test:planning`, `test:memories`. **Consolidar, não duplicar:** `pnpm test:e2e` roda o conjunto crítico; as suítes por bloco continuam existindo para desenvolvimento. Duas versões do mesmo teste divergem, e a que falhar primeiro será a que ninguém roda.

### Teste instável é pior que teste ausente

Um teste que falha uma vez a cada cinco execuções ensina a equipe — neste caso, uma pessoa — a rodar de novo em vez de ler. Regras:

- zero `waitForTimeout`. Asserção que espera, sempre;
- cada spec cria o próprio dado, com título único, e limpa no fim, inclusive quando falha. Nada de depender do seed, nada de depender da ordem;
- os specs que mexem em estado global do workspace rodam em série; os isolados podem paralelizar. Diga qual é qual e por quê;
- sessão feita uma vez e reaproveitada por `storageState`, menos nos specs de entrar e sair, que precisam do contexto limpo;
- guarda de ambiente: a suíte aborta se `NEON_BRANCH` não for `development` ou se o bucket não for `date-media-dev`. A mesma guarda do seed, pelo mesmo motivo;
- a suíte roda **três vezes seguidas** na verificação. Três verdes seguidos é o mínimo para chamar de estável; um verde não diz nada.

### O arnês que transforma o teste em auditoria

Todo spec, por fixture compartilhado, falha se a página produzir:

- qualquer erro de console;
- qualquer `pageerror`;
- qualquer `securitypolicyviolation`;
- qualquer resposta de rede 4xx ou 5xx não esperada pelo próprio teste.

É isso que faz a CSP ser verificada de graça em toda tela, toda vez, em vez de uma vez na mão. Exceção precisa estar numa lista curta, com o motivo escrito ao lado — lista de exceções sem motivo é lista que cresce.

Os contextos do Playwright cobrem também a matriz da Definition of Done sem trabalho extra: `colorScheme` claro e escuro, `reducedMotion: 'reduce'`, e as três larguras.

---

## 9. Acessibilidade

### axe, com o que ele é

`@axe-core/playwright` entra como dependência de desenvolvimento, e é a única adição de dependência sancionada neste bloco. Justificativa: é o motor de referência, roda dentro do Playwright que já existe, e não vai para o pacote do produto.

Ele roda em todas as rotas, nos dois temas. Nenhuma violação de severidade `serious` ou `critical` passa.

E vale dizer o que ele **não** faz: axe encontra algo em torno de um terço dos problemas reais de acessibilidade. Ele não sabe se o nome acessível faz sentido, se a ordem de leitura é a ordem visual, nem se a tela é usável. Então ele não substitui nada da seção 2 da Definition of Done — ele acrescenta.

### A passada manual, uma vez, inteira

O fluxo 3 da seção anterior — criar, sugerir, votar, confirmar — percorrido só com teclado, do começo ao fim, em 390px e em desktop. Relatar onde o foco se perdeu, onde a ordem de tabulação pulou, onde algo só funcionou com mouse.

### Os itens pontuais que este bloco fecha

- `<html lang="pt-BR">`. O scaffold do Next nasce com `lang="en"`, e é o defeito mais provável deste repositório. Leitor de tela lendo português com fonética inglesa é ininteligível. Confirme no HTML servido, não no JSX;
- **título por rota**, único e descritivo. Rota que herdou o título do layout é rota que não existe na lista de janelas;
- o **link de pular conteúdo** funciona de verdade: primeiro Tab, visível, e leva ao `<main>`;
- landmarks e ordem de cabeçalhos por rota — axe pega, confirme que pegou;
- contraste nos dois temas, pela regra `color-contrast` do axe. Os cálculos do R1 cobriram combinações escolhidas à mão; esta é a varredura. Se a paleta ainda estiver em ajuste, o resultado desta varredura é o dado que fecha o ajuste.

---

## 10. Performance móvel, medida

"Está rápido" é medido na máquina de quem escreveu, com dado de seed, em wi-fi. Substituir por números:

### JavaScript por rota

A tabela de `pnpm build` é o instrumento, colada inteira. Orçamento: First Load JS ≤ 140 kB nas rotas que o celular abre primeiro — `/`, `/ideias`, `/agenda`, `/login`. Acima disso, o relatório diz qual rota, quanto, e o que está dentro.

Um suspeito nomeado: o **Motion**. O design system o usa em wrappers pequenos (`Reveal`, dropdown), e o pacote inteiro é caro para isso. Meça o que ele contribui e reporte. **Não refatore por conta própria** — a decisão de trocar por importação parcial ou por CSS é do proprietário, com o número na frente.

### Bytes de imagem, que é onde o celular sofre de verdade

A rota de mídia aceita `?v=thumb`. A miniatura existe porque uma grade servindo imagem cheia é inviável no celular (`docs/MEDIA_R2.md` seção 3) — e usar a cheia por engano não tem sintoma nenhum no desktop de quem desenvolve.

Então, medido pela rede do Playwright:

- em `/ideias`, `/memorias` e no calendário: **zero** requisições sem `?v=thumb`;
- total de bytes de imagem de `/ideias` com um fixture de 30 planos com foto, não com os oito do seed;
- `/planos/[id]`: a capa é a cheia, e é uma cheia — a galeria continua em miniatura.

### O resto

- a imagem maior da primeira dobra da Home tem `priority`; as outras não. Duas ou três com `priority` é o mesmo que nenhuma;
- `width` e `height` em toda imagem — deslocamento de layout ao carregar foto é o defeito visual mais caro e o mais fácil de evitar;
- fontes: confirme que `next/font` está auto-hospedando e pré-carregando, e que não sobrou nenhuma requisição a domínio de terceiro. `connect-src`/`font-src` sem terceiros já obriga isso, mas confirme na aba de rede.

---

## 11. O que este bloco não faz

Notificação push, sincronização offline, fila de escrita offline, Background Sync, Web Share, share target, badge de ícone, banner de instalação próprio via `beforeinstallprompt`, atalhos de manifest (abaixo da linha de corte), screenshots de manifest, telas de splash do iOS, cache de rota, cache de dado, Workbox, `next-pwa`, relatório de violação de CSP para serviço externo, rate limiting, WAF, e qualquer alteração de funcionalidade de produto.

Sobre o banner de instalação próprio: `beforeinstallprompt` não existe no iOS, então um banner customizado resolveria metade do problema e acrescentaria estado à interface. O que entra no lugar é uma linha estática no perfil, sem JavaScript, dizendo como instalar em cada sistema. Uma frase resolve o que uma feature resolveria pior.

O B11 deixa o produto instalável, fechado e medido. É só isso, e é o suficiente para o B12 ser só configuração e confirmação.
