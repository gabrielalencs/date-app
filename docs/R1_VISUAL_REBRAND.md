# DATE — R1: entrega e verificação visual

11/09/2026 · branch `develop` · base `a826ceb`.

Rebrand das nove telas existentes, construído a partir de tokens, primitives e composições compartilhadas. O repositório recebido já continha B6; datas, votos e confirmação foram preservados e reestilizados. Agenda B7 e Memórias B9 continuam em seus estados preparatórios. Não houve migration, alteração de Auth/API/schema/R2 do produto, push, merge ou ação em produção.

## A. Diagnóstico inicial

O fundo sand ocupava áreas extensas sem distinguir contexto e tarefa. Botões primary eram coral; selects nativos, campos simples e títulos isolados reforçavam uma aparência utilitária. Home tinha pouca presença fotográfica; Nova ideia e Perfil deixavam conteúdo estreito perdido no desktop. Detalhe começava como formulário e repetia blocos vazios. A marca aparecia nos tokens, mas faltavam composição editorial, variação de superfícies e prioridade visual.

Foram lidos CLAUDE.md, AGENTS.md, DATE_PROJECT_SPEC.md, HANDOFF_STATUS.md, DESIGN_SYSTEM, DECISION_LOG, DEFINITION_OF_DONE e os documentos das features existentes. Foram inspecionados componentes, temas, CSS, navegação, assets oficiais, prancha de marca, mockups e capturas anteriores. Os cinco comandos iniciais exigidos foram executados antes das edições: árvore limpa, lint, typecheck, 236 testes unitários e build aprovados.

## B. Nova direção

Fraunces marca saudação, títulos e mensagens editoriais; Inter organiza controles e metadados. Fotografia ocupa o foco emocional. Navy assume ações e navegação; superfícies de apoio distinguem categorias e contextos. Espaçamento, divisores e tipografia organizam conteúdo sem encapsular cada grupo.

Primitives novos: `Wordmark`, `Horizon`, `EditorialNote`, `PhotoStory`, `PageIntro`, `CategoryArt`, `Reveal` e `DateSelect`. O sistema é reutilizável pelas próximas features. As fotografias de marca são inspiração estática, nunca dados ou memórias atribuídos automaticamente ao casal.

## C. Sistema de cores

| Família | Aplicação |
| --- | --- |
| Navy | Texto, primary, ações secundárias importantes e estrutura da navegação |
| Coral | Novo DATE, Salvar ideia, marcações pequenas, logo e traço editorial |
| Sage | Natureza, estado positivo e orientação contextual |
| Soft Blue | Viagem, seleção, campos contextuais e empty states |
| Blush | Gastronomia, reflexão editorial e apoio de baixa intensidade |
| Warm Taupe | Cultura, superfícies secundárias e hover neutro |
| Sand / Cream | Fundo e superfícies quentes, separados do branco dos painéis |
| Neutros | Texto secundário, bordas e divisão entre planos de leitura |

As versões claras e escuras ficam exclusivamente em `app/globals.css`. Contrastes calculados dos tokens finais: texto secundário sobre cream 5,53:1; sage/blush 4,86:1; blue 4,99:1; taupe 4,62:1. Branco sobre coral 3,09:1 e sobre hover 3,85:1: a variante accent mantém o piso de 19px semibold de D-017. No escuro, texto secundário sobre blue chega a 4,81:1. Estes cálculos cobrem as combinações citadas, sem equivaler a uma certificação integral de acessibilidade.

## D. Componentes

- Button/ButtonLink: primary navy, accent coral, secondary quente, outline, ghost e danger próprio; piso de toque 44px, normal 48px.
- Input/Textarea: label, helper/erro, ícones opcionais, altura de linha única 52px, superfície e foco DATE; texto de 16px.
- SelectField/DateSelect: Radix headless, trigger, chevron, menu, seleção com check, teclado, digitação, Escape, foco, reset e input hidden para serialização. Zero select nativo visível nas telas auditadas.
- Checkbox/radio: aparência DATE mantendo os inputs e labels reais. Chips e tema usam estados identificáveis além de cor.
- Badge/StatusPill, EmptyState, cards e IconButton: paleta e hierarquia compartilhadas.
- Sheet/Dialog: bordas, superfícies, tamanhos, scroll e safe area. A confirmação de remoção de foto usa o Dialog DATE, com cancelar, pending e erro.
- Shell: sidebar de 240px, logo oficial, indicação ativa discreta, tema/perfil e bottom navigation compacta.

Foram adicionadas somente as dependências pedidas para este trabalho: `@radix-ui/react-select` e `motion`. Não houve troca de component library.

## E. Telas

| Tela | Resultado |
| --- | --- |
| Login | Foto e marca com área de acesso limpa; hero compacto no mobile/tablet, composição dividida a partir de 1024px; formulário privado sem signup |
| Home | Saudação editorial, próximo DATE real, fotografia de inspiração, CTA navy, resumo discreto dos status e ideias existentes |
| Ideias | Título e introdução, filtros DATE por GET e cards com fotografia ou fallback tipográfico de categoria |
| Nova ideia | Formulário principal com título/categoria/link existentes, contador e orientação; rail fotográfico no desktop |
| Detalhe | Capa grande, título/descrição/metadados, rail de status, datas e fotos; edição recolhível com todos os campos existentes |
| Perfil | Papel, preferência de tema e logout, equilibrados com fotografia e mensagem de marca |
| Agenda | Estado honesto de preparação, foto e ligação com as ideias; sem calendário fictício |
| Memórias | Estado preparatório editorial; sem registros inventados |
| Kitchen Sink | Catálogo funcional de tokens, tipografia, variantes, campos, Select, escolhas, cards, estados e overlays nos dois temas |

## F. Motion

`Reveal` anima apenas um grupo editorial, com fade e deslocamento de 8px por 280ms. O dropdown usa Motion por 180ms. Botões têm hover/press discretos; cards deslocam 2px e fotografias ampliam 1,015 no hover adequado. Sheets/dialogs usam animações CSS de entrada de 320ms sobre primitives Radix. Pending e sucesso continuam textuais.

Com reduced motion, wrappers removem deslocamento e limitam fade a 100ms; CSS desliga animações e movimentos de hover/press. O teste em navegador verifica preferência reduzida, `animation-name: none`, transição de 100ms e comportamento dos overlays. Nenhuma página de dados foi convertida inteira em Client Component por causa de animação.

## G. Responsividade

320, 390 e 1280px foram exercitados nas nove telas, em light e dark. As auditorias de navegador passaram com zero overflow horizontal, zero alvo visível abaixo de 44px e zero select padrão visível. Labels de navegação permanecem legíveis; status precede as seções de trabalho no detalhe mobile; CTAs continuam alcançáveis por rolagem. Campos e menus mantêm largura da coluna.

Login também foi capturado em 768 e 1440px. Em 768px foi mantida a composição de uma coluna para evitar uma fotografia vertical estreita. Em desktop há max-width e rail apenas nas composições que o usam.

Safe areas estão implementadas em CSS. A verificação foi feita no Chromium/Playwright com viewports e teclado; não foi uma sessão em dispositivos físicos iOS/Android nem uma auditoria com VoiceOver.

## H. Light / Dark

Light separa cream, branco, warm surface e cores suaves de apoio. Dark usa fundo #0E171D e superfície #15232C, camadas navy elevadas, texto creme e apoios sage/blue/blush/taupe escurecidos. O botão estrutural ganha foreground navy sobre névoa para manter contraste. Fotografias não recebem inversão ou filtro global. A preferência existente claro/escuro/sistema permanece.

## I. Screenshots e inspeção

**As capturas foram abertas e avaliadas visualmente.** A matriz das nove telas e da edição foi aberta em pranchas por trechos, preservando todo o conteúdo dos PNGs; Select e overlays também foram abertos. Além disso, foram abertos originais prioritários: Home 1280 claro e 390 escuro, Nova ideia 1280, detalhe 1280, detalhe com foto real de teste, Perfil escuro, login 390, login 768/1440 e controles em 320px. As capturas afetadas foram geradas novamente após as correções.

74 capturas de entrega em `screenshots/r1/`. Para cada linha com seis variantes, o nome usa `{320,390,1280}-{light,dark}.png`:

| Prefixo de arquivo | Quantidade |
| --- | ---: |
| `login-` | 6 |
| `home-` | 6 |
| `ideias-` | 6 |
| `nova-ideia-` | 6 |
| `detalhe-` | 6 |
| `perfil-` | 6 |
| `agenda-` | 6 |
| `memorias-` | 6 |
| `kitchen-sink-` | 6 |
| `detalhe-edicao-` | 6 |
| `select-aberto-` | 6 |
| `sheet-{320,390,1280}-light.png` | 3 |
| `dialog-{320,390,1280}-light.png` | 3 |
| `login-768-light.png`, `login-1440-light.png` | 2 |

O manifesto local `screenshots/r1/review/manifest.json` relaciona as pranchas aos arquivos originais. Há também um PNG de diagnóstico de uma tentativa anterior de login, fora das 74 capturas de entrega.

As suítes anteriores regeneraram 79 arquivos em `screenshots/`: kitchen/login (12), Home/Ideias/Novo/Detalhe (24), mídia (18) e datas (25). Os arquivos R1 são a referência principal de shell: preservam sidebar e navegação fixas reais. Algumas suítes antigas estabilizam essas posições por CSS na captura.

Defeitos encontrados e corrigidos:

1. Home podia ficar sem fotografia quando havia próximo DATE sem capa: mantém inspiração fotográfica ao lado do próximo plano real.
2. Hero do login mobile era alto: reduzido para permitir chegada mais rápida ao formulário. Em tablet, a divisão em duas colunas foi adiada para 1024px.
3. Recorte vertical cortava parte do casal e ampliava uma imagem menor: coast passou a ancorar o assunto à direita; PhotoStory serve o WebP local já comprimido em sua resolução original.
4. Fallbacks sem foto ficavam excessivamente altos no mobile: altura compacta e proporção editorial no desktop.
5. Capa repetida na galeria: detalhe passou a exibi-la uma vez como hero, mantendo seus controles na seção de fotos.
6. Contraste de muted sobre taupe e de branco no hover coral escuro: tokens ajustados.
7. Kitchen Sink encostava nas bordas e esticava cards de alturas diferentes: largura/padding próprios e alinhamento pelo topo.
8. Placeholder longo e copy com acentos corrompidos: corrigidos. Auditoria de alvo revelou padding em skip link oculto: passou a existir somente no foco.
9. Captura do menu ainda durante o fade, foto lazy ainda não carregada e posição rolada no detalhe de edição: captura aguarda fonte/imagem/transição e restaura o topo. Isso corrige a prova visual, preservando o comportamento normal do produto.

Autoauditoria solicitada: coral não domina nenhuma das telas de produto revisadas; navy e as superfícies de apoio participam de fato; nenhum input ou select tem aparência default; nenhum componente conserva estética shadcn padrão; Nova ideia e Perfil têm composição intencional; datas e metadados usam divisores e espaço, sem uma caixa por grupo. Interações têm feedback. A identidade continua reconhecível pela combinação de fotografia, Fraunces, horizonte, proporções e paleta mesmo sem o logo ou os botões coral. Essa é uma avaliação visual da implementação, não uma aprovação em nome do proprietário.

## J. Testes — resultados reais

Ambiente confirmado: Neon `development` e R2 `date-media-dev`. Nenhum segredo foi incluído nos artefatos versionados. Scripts descobertos no package.json; pnpm executado pelo `pnpm.cmd` disponível na máquina.

| Portão | Resultado |
| --- | --- |
| `pnpm lint` | exit 0, sem erros |
| `pnpm typecheck` | tipos de rotas gerados; `tsc --noEmit`, exit 0 |
| `pnpm test` | 18 arquivos, **236 passed** |
| `pnpm build` | Next 16.3.4: compiled successfully, TypeScript e geração de páginas concluídos, exit 0 |
| `pnpm test:tz` | **35 passed** em UTC, **35 passed** em America/New_York e **35 passed** no fuso local |
| `pnpm test:db` | 4 arquivos, **59 passed** |
| `pnpm test:media` | 1 arquivo, **8 passed**, ciclo real no R2 dev |
| Playwright completo | **93 passed (3.4m)**, Chromium, um worker |
| Select/overlays após reforço de teclado/reduced motion | **4 passed (16.6s)** |
| CRUD após reforço de persistência do Select | **5 passed (27.3s)** |
| Login + recaptura R1 após último ajuste fotográfico/tablet | **14 passed (1.3m)** |

Comando do Playwright completo:

```sh
node --env-file=.env.local ./node_modules/@playwright/test/cli.js test --workers=1
```

Ele inclui os arquivos atendidos por `shots`, `shots:auth`, `test:http`, `test:auth`, `test:crud`, `shots:plans`, `test:media-e2e`, `shots:media`, `test:dates` e `shots:dates`, além de `rebrand.spec.ts` e `select.spec.ts`. Os aliases não foram contados como execuções adicionais da mesma cobertura.

Depois dos ajustes fotográficos, foram reexecutados `rebrand.spec.ts` e `login.spec.ts`, com novo build e recaptura de todas as telas R1: 14 testes aprovados. Lint e typecheck foram conferidos novamente sobre o código final.

O Select é exercitado por setas, End, Enter, busca por digitação, Escape, retorno de foco, reset, disabled, erro acessível, opção vazia e FormData. O CRUD confirma Cultura após criação, troca para Viagem e prioridade Alta, salva e verifica ambos após reload. Upload, EXIF, capa, remoção/cancelamento, leitura privada, workspace scoping, datas/votos e login/logout continuam cobertos.

## K. Regressões e limites

As primeiras execuções encontraram seletores de teste dependentes do H1 antigo/native select, um teste de foco adiantado em relação à abertura do Radix e copy corrompida. Foram corrigidos, com cobertura comportamental preservada e ampliada.

Houve tentativas intermediárias de login que ficaram na tela com a mensagem genérica de credencial inválida durante suítes de datas. A causa do provedor não foi comprovada. As suítes de feature agora reutilizam, somente em memória, cookies de uma autenticação real; a suíte específica de Auth continua testando logins e logout. A execução completa posterior passou sem falhas.

O lint também detectou imports CommonJS no utilitário local de montar pranchas; ele foi convertido para ESM, e lint passou novamente.

**Nenhuma regressão funcional pendente foi identificada nas verificações concluídas.** O controle Radix exige JavaScript para interação, conforme o novo padrão solicitado. URLs de filtro por GET e a renderização do formulário de login continuam verificadas sem JavaScript; isso não significa um Select interativo sem hidratação.

## L. Documentação e arquivos

Documentos atualizados: `DATE_PROJECT_SPEC.md`, `HANDOFF_STATUS.md`, `docs/DESIGN_SYSTEM.md`, `docs/DECISION_LOG.md` (D-067 a D-071), `docs/DEFINITION_OF_DONE.md` e `docs/ROADMAP.md`. Criados `docs/BRAND_ASSETS.md` e este relatório.

Arquivos de implementação agrupados:

- Sistema: `app/globals.css`, `lib/button-variants.ts`, `components/ui/{field,select,badge,status-pill,icon-button,empty-state,dialog,sheet}.tsx`, `components/theme-toggle.tsx`, `components/brand/`, `components/motion/reveal.tsx`, package.json/lockfile e `public/brand/photos/`.
- Shell e telas: `components/shell/{app-shell,sidebar,bottom-nav}.tsx`, páginas de login e das sete rotas privadas atuais, `app/kitchen-sink/{page,showcase}.tsx`.
- Features: formulário de login; new/edit plan, filtros, card e status; next date, opções, votos e lista de datas; ações e galeria de fotos.
- Testes: variantes de botão, auth-live, CRUD, mídia, datas, fixtures, sessão de feature, rebrand/Select e integração R2. Asserções existentes de autorização e regras de negócio permaneceram.

## M. Git

Trabalho realizado na `develop`, a partir de árvore limpa em `a826ceb`. Commits separados por sistema, aplicação às telas, testes e documentação. Diff e arquivos preparados são revisados antes dos commits; `.env.local`, credenciais, caches e screenshots não entram no Git. As capturas permanecem disponíveis localmente e as suítes permitem regenerá-las.

| Commit | Conteúdo |
| --- | --- |
| `5c2ec27` | `style(date): establish R1 editorial design primitives` |
| `df8ce48` | `style(date): apply R1 across shell and current screens` |
| `b5aa843` | `test(date): cover R1 controls and isolate visual fixtures` |
| Commit deste relatório | `docs(date): record R1 design system and validation` |

Working tree final: limpa após o commit de documentação. Screenshots, relatório HTML do Playwright e arquivos de build continuam ignorados conforme a configuração existente. Nenhum push ou merge realizado. O hash do próprio commit de documentação está na mensagem de entrega e em `git log -1`.
