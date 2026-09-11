# DATE — Design System · R1

Referência permanente para todas as telas. O R1 substitui a direção visual do B1. Funcionalidades e autorização continuam regidas pelo DATE_PROJECT_SPEC.md e pelos documentos de cada feature.

## Direção

Editorial + lifestyle + planejamento pessoal + fotografia. Um aplicativo íntimo e adulto para duas pessoas, com espaço para as experiências. Navy estrutura; coral chama atenção; sage, blue, blush e taupe dão variedade; cream e sand deixam respirar; fotografia dá emoção.

Os mockups orientam composição, atmosfera e hierarquia. Não autorizam signup, rotas novas, calendário antecipado, checklist, favoritos ou dados fictícios no produto. O B6 já existia no repositório ao iniciar o R1 e sua interface recebe o mesmo sistema; nenhuma feature futura é antecipada.

## Cor e superfícies

A fonte de verdade executável é `app/globals.css`. HEX só vive nos tokens ou nos assets oficiais, nunca em páginas.

| Papel / token | Claro | Escuro |
| --- | --- | --- |
| Fundo `--bg` | Cream #FBF7F2 | #0E171D |
| Superfície `--surface` | Branco #FFFFFF | Navy #15232C |
| Campo / superfície suave `--surface-soft` | #F7F3EE | #192831 |
| Superfície quente `--surface-sunken` | #F2E9E1 | #1C2A34 |
| Estrutura interativa `--brand` | Navy #1E2D3D | Névoa #C4D4DD |
| Hover estrutural `--brand-hover` | #31495B | #E0E9ED |
| Texto sobre estrutura `--brand-fg` | #FFFFFF | #15232C |
| Acento de marca `--accent` | Coral #E76F51 | Coral #E76F51 |
| Apoio sage `--sage-soft` | #E5EBE1 | #283B35 |
| Apoio blue `--mist-soft` | #E7EDF0 | #273C49 |
| Apoio blush `--blush-soft` | #F7E6DD | #42332F |
| Apoio taupe `--taupe-soft` | #ECE2DA | #373531 |
| Borda `--border` | Warm Border #E4DDD6 | Creme a 12% |
| Borda forte `--border-strong` | Navy a 22% | Creme a 22% |
| Texto `--text` | #1E2D3D | #F1E7DC |
| Texto secundário `--text-muted` | #586673 | #9AAAB6 |
| Positivo `--positive` | #7E9673 | #A7B89F |
| Erro / destrutivo `--danger` | #9E3B2E | #EE9F92 |
| Foco `--ring` | #637E8E | #A6BFCD |

A paleta da marca continua incluindo Sage #A7B89F, Sand #F6EDE4, Graphite #282B2B, Blush #F3D7CC, Soft Blue #B7C4CF e Warm Taupe #D7C4B8. As superfícies acima são suas versões de baixa intensidade, adaptadas a cada tema. Não usar os tons brutos como texto pequeno. Estados informam seu significado também por texto, check ou outra marca.

Coral é uma fração pequena da tela: logo, traço editorial, ponto de navegação e CTA de marca. Não é o primary estrutural, texto de filtro, fundo da página ou cor de todas as ações. Branco sobre coral exige 19px semibold por contraste (D-017); o componente `accent` garante esse piso. Erros usam o token danger, nunca coral.

Dark tem camadas navy distintas, superfícies de apoio escuras, texto creme e controles claros sobre navy. Fotografias preservam sua cor; nenhum filtro global ou inversão automática. O tema `system` continua sendo resolvido pelo ThemeProvider, com script inicial que evita flash.

## Tipografia

Fraunces via next/font: display, H1, títulos editoriais, títulos de plano e grandes números. Eixo `opsz` mantido; não foi adicionada fonte manuscrita. Inter via next/font: corpo, formulários, controles, navegação, metadados e rótulos.

| Estilo | Mobile | Desktop | Entrelinha |
| --- | --- | --- | --- |
| display-xl | 44px | 64px | 1.02 |
| display-l | 32px | 40px | 1.1 |
| title | 24px | 28px | 1.2 |
| section-heading | 24px | 24px | 1.2 |
| body | 16px | 16px | 1.55 |
| body-s | 14px | 14px | 1.5 |
| meta | 13px | 13px | 1.45 |
| label | 12px | 12px | 1.4 |

Labels usam caixa alta e tracking 0.12em. Navegação e pills usam caixa normal para leitura confortável. Nada abaixo de 12px; Fraunces nunca abaixo de 20px. Valores alinhados usam tabular numbers. Títulos longos quebram dentro da coluna; cards limitam linhas, detalhe mostra o título inteiro.

## Espaço, raio e elevação

Escala de 4px. Controles relacionados: 8–12px; grupos: 16–24px; seções: 32–48px; grandes divisões podem chegar a 72px. `.page-stack` define o ritmo responsivo; `.panel` define superfície e padding de 20–32px; `.section-heading` define o título de grupo.

Raios: 10px em campo (`sm`), 14px em botão/controle (`md`), 20px em superfície editorial (`lg`), circular apenas em avatar, chip ou ação circular. Revoga o teto rígido de 14px do B1, mantendo proporção moderada.

Bordas quentes sutis no claro, creme translúcido no escuro. Sombra raised curta para dropdown e barra mobile; overlay para sheet/dialog. Cards comuns usam borda e deslocamento sutil. Sem sombra colorida, pilhas de caixas, vidro, glow ou backdrop-filter.

## Botões

`lib/button-variants.ts` é a fonte compartilhada por Button e ButtonLink.

| Variant | Papel |
| --- | --- |
| accent | Coral, CTA de marca como Novo DATE e Salvar ideia; 19px semibold |
| primary | Navy no claro e névoa no escuro; ação importante, 16px |
| secondary | Superfície quente e rótulo contrastante |
| outline | Superfície, borda navy discreta e texto contrastante |
| ghost | Baixa ênfase, sem caixa permanente |
| danger | Texto e borda semânticos, distintos de coral |

Tamanho normal mínimo 48px; pequeno mínimo 44px. O accent não aceita tamanho pequeno. IconButton tem 44px e nome acessível obrigatório. Pending desabilita a ação e troca o rótulo; sem spinner. Hover/tap sutis só quando apropriados; disabled tem contraste atenuado e permanece reconhecível.

## Campos e Select DATE

Input/Textarea/SelectField compartilham FieldShell, label real, helper e erro ligados por aria-describedby, aria-invalid, superfície quente, borda discreta e anel de foco. Altura 52px no controle de uma linha, fonte 16px para evitar zoom de teclado móvel. Slot de ícone é opcional e usa Lucide linear. Borda coral permanente é proibida.

SelectField transforma opções declarativas em DateSelect, baseado em `@radix-ui/react-select` headless. O usuário vê trigger customizado com chevron Lucide, dropdown da superfície DATE, hover azul suave e check na seleção. Radix mantém setas, Home/End, busca por digitação, Enter, Escape, foco e portal. Motion faz entrada curta do dropdown. Altura disponível, collision padding e largura do trigger limitam o menu no mobile.

A serialização usa input hidden com o valor real. A opção vazia de filtro continua vazia, sem enviar o sentinel interno do Radix. O select nativo auxiliar de acessibilidade do Radix permanece oculto. Nenhum select HTML padrão fica visível. Form reset restaura o default e disabled não envia valor. CRUD testa o valor chegando à Server Action.

O controle customizado depende de JavaScript para interação. URLs de filtro por GET e a renderização do formulário de login continuam funcionando sem JavaScript; não confundir isso com um Select interativo sem hidratação.

Checkbox e radio conservam inputs nativos e labels reais, com desenho DATE via CSS; o label fornece alvo de toque de pelo menos 44px. Segmented controls usam navy e aria-pressed. Componentes complexos não reimplementam à mão o comportamento acessível do Radix.

## Fotografia, marca e cards

Os SVGs oficiais de `public/brand/logos/` são usados por Wordmark. Não recompor date com texto, redesenhar o símbolo nem usar as referências luminosas como asset de interface. Preservar proporção e usar versão clara/escura adequada.

Fotografia privada de plano continua chegando por `/api/media/[id]`, autenticada, com next/image unoptimized e sem URL pública R2. Nenhuma mudança de acesso ou armazenamento pertence ao R1.

Fotografia editorial estática de marca vive em `public/brand/photos/`; não representa uma experiência ou memória do usuário. Ver `docs/BRAND_ASSETS.md` para origem. Não preencher plano sem imagem com foto genérica de um lugar, nem criar records fictícios para completar layout.

Hero de detalhe usa aproximadamente 16:8, destaque horizontal 16:9, card com fotografia usa 4:5, galeria 1:1. O enquadramento deve preservar assunto e reservar texto legível. Overlays são permitidos exclusivamente como scrim discreto de legibilidade sobre foto, sem gradiente chamativo como fundo da interface.

Sem imagem, CategoryArt usa tipografia, ícone de categoria e desenho linear de horizonte em superfície sage/mist/blush/taupe. É um estado intencional, sem grande retângulo vazio. Metadados compactos e StatusPill mantêm a mesma linguagem nos cards com e sem fotografia. Hover amplia foto em 1.015 e move o card poucos pixels, somente em desktop e sem reduced-motion.

## Layouts atuais e futuros

Sidebar desktop de 240px: asset oficial com respiro, Novo DATE destacado, navegação com ícone/rótulo, superfície leve no ativo, tema e perfil no rodapé. Não adicionar destinos para imitar o mockup. Mobile: Início · Ideias · + · Agenda · Memórias, barra compacta, labels de 12px, alvos de 44px e safe area. Perfil acessível no cabeçalho mobile. Link de pular conteúdo para teclado.

Conteúdo máximo 1360px incluindo padding; uma coluna mobile. Desktop usa coluna principal e rail apenas quando tem função. Espaço vazio deve servir à tipografia ou fotografia, nunca ser sobra de formulário estreito.

- Login: fotografia e marca + área de acesso; hero compacto no celular, formulário com teclado adequado e sem autofocus que pule o hero. Nunca signup.
- Home: saudação editorial, próximo DATE real quando disponível, inspiração estática e ideias existentes. Resumo discreto de status sem cartões de KPI. Não chamar contagens globais de resumo mensal.
- Ideias: heading e introdução, controles integrados e grade visual. Filtros continuam GET, sem busca nova ou dados inventados.
- Nova ideia: cadastro rápido e rail editorial de orientação; uma coluna mobile. Não antecipar campos de negócio.
- Detalhe: capa, categoria, título, descrição e metadados; rail de status/ações; datas, galeria e edição recolhível. Mobile coloca o status antes das seções de trabalho.
- Perfil: identidade institucional, papel, tema e logout existentes.
- Agenda B7: o estado atual é honesto. O futuro calendário poderá ocupar a coluna principal, com rail opcional de planos reais. Não criar grade de datas fake.
- Memórias B9: estado preparatório editorial; nenhuma memória falsa. A futura timeline reutiliza tipografia, fotografias, cards e superfícies daqui.

## Movimento

Motion é usado em wrappers pequenos: Reveal para um grupo editorial e motion.div para dropdown. Páginas que consultam dados permanecem Server Components. CSS cobre hover/press de botões, cards, fotografia e animações dos overlays Radix.

Micro: 120–180ms; dropdown: 180ms; entrada editorial: 280ms, deslocamento 8px; sheet/dialog: 320ms. Animar opacity/transform. Sem stagger de toda a tela, bounce, partículas, parallax ou loop decorativo. Skeleton pode pulsar como feedback funcional.

`useReducedMotion` remove deslocamentos do Motion e reduz o fade para 100ms. A regra CSS global desliga animações, limita transições a opacity e anula o press do card. Testar a preferência real do browser, não apenas a existência de uma media query.

## Estados e acessibilidade

Foco visível 2px com offset; texto secundário legível em ambos os temas; ações nomeadas; estados não dependem apenas de cor. Empty states usam texto curto, ícone e ação existente. Não informar detalhes de implementação em copy de produto. Erros mantêm instrução de recuperação; sucesso é textual e discreto; loading usa rótulo/skeleton. Sheets/dialogs usam Radix para Escape, trap, retorno de foco e scroll lock.

Portões de interface: 320, 390 e 1280px em claro/escuro; checar também 768 e 1440 quando possível. Zero overflow horizontal, alvos >=44px, nenhum native select visível, navegação por teclado, foto sem erro e reduced motion respeitado.

## Catálogo e continuidade

`/kitchen-sink` é o catálogo de tokens, tipos, botões, inputs, textarea, Select, checkbox, radio, filtros, cards, pills, loading, disabled, error, sheet e dialog. Continua condicionado a DATE_ENABLE_KITCHEN_SINK; não habilitar em produção. Novas features devem compor esses primitives e os padrões editoriais, sem criar outro vocabulário de tokens.

Capturas de referência R1 ficam em `screenshots/r1/` (artefatos locais não versionados). A validação e decisões finais ficam em `docs/R1_VISUAL_REBRAND.md`.
