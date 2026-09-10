# DATE — Design System

Substitui a referência a `docs/03_DESIGN_SYSTEM.md`. Este documento é normativo: o que estiver aqui vence improviso do agente.

---

## 1. Princípio

A interface é um suporte para fotografia e tipografia. Ela não compete com o conteúdo.

Três decisões carregam a identidade inteira:

1. **O fundo claro é areia, não branco.** Branco é superfície elevada. Isso é o que separa "editorial" de "SaaS".
2. **Contraste tipográfico é a ferramenta principal.** Fraunces grande e apertada nos títulos, Inter pequena e espaçada nos rótulos. A tensão entre as duas é a assinatura visual.
3. **Estrutura por borda, não por sombra.** Fio de 1px em baixo contraste. Sombra só para o que realmente flutua.

Se uma tela ficar sem graça, a resposta é foto maior e título maior — nunca mais cor, mais sombra ou mais card.

---

## 2. Cores

### Paleta bruta (congelada)

| Nome | Hex |
|---|---|
| Navy | `#1E2D3D` |
| Coral | `#E76F51` |
| Sage | `#A7B89F` |
| Sand | `#F6EDE4` |
| Graphite | `#282B2B` |
| White | `#FFFFFF` |
| Dark bg | `#0E171D` |
| Dark surface | `#15232C` |

Nenhum componente referencia esses valores diretamente. Tudo consome token semântico.

### Tokens semânticos

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--bg` | `#F6EDE4` | `#0E171D` | fundo da página |
| `--surface` | `#FFFFFF` | `#15232C` | card, sheet, campo |
| `--surface-sunken` | `#EFE4D7` | `#0A1116` | trilho, faixa, estado vazio |
| `--border` | `#1E2D3D` @ 12% | `#F1E7DC` @ 12% | fio padrão |
| `--border-strong` | `#1E2D3D` @ 22% | `#F1E7DC` @ 22% | foco, seleção, divisor forte |
| `--text` | `#1E2D3D` | `#F1E7DC` | texto principal |
| `--text-muted` | `#5C6B78` | `#9AAAB6` | metadado, legenda |
| `--accent` | `#E76F51` | `#E76F51` | ação primária, ponto, destaque |
| `--accent-hover` | `#D65C3E` | `#F0805F` | hover/press da ação primária |
| `--accent-fg` | `#FFFFFF` | `#FFFFFF` | rótulo sobre coral |
| `--positive` | `#7E9673` | `#A7B89F` | consenso, confirmado, sim |
| `--danger` | `#9E3B2E` | `#C4574A` | destrutivo, erro |
| `--ring` | `#E76F51` @ 45% | `#E76F51` @ 55% | anel de foco |

Declarados como custom properties em `app/globals.css`, expostos ao Tailwind 4 via `@theme`. Tema escuro por classe, com `@custom-variant`, nunca por `prefers-color-scheme` sozinho — `system` é resolvido em JS e escreve a classe.

### Regra do coral

**Coral nunca é texto.** Sobre areia, `#E76F51` fica em torno de 2,7:1 — ilegível por qualquer critério.

Coral aparece como preenchimento sólido, ponto, ícone acompanhado de rótulo em navy, ou borda. Nunca como palavra.

Sobre preenchimento coral, o rótulo branco só é aceitável a partir de **19px semibold**, onde 3:1 satisfaz AA para texto grande. Botão coral menor que isso não existe no DATE. Ação secundária pequena usa navy sobre superfície, ou borda coral com rótulo navy.

Essa restrição não é negociável para agradar a prancha de marca.

---

## 3. Tipografia

Duas famílias, carregadas por `next/font` com `display: swap` e variável CSS. Nada de `@import` de CDN.

**Fraunces** — display, wordmark, títulos editoriais. É variável; usar eixo óptico coerente com o tamanho e manter WONK desligado, porque as formas excêntricas viram caricatura em corpo grande. Confirme o nome exato dos eixos na documentação atual do `next/font` antes de escrever e reporte o que usou.

**Inter** — interface, corpo, dados, rótulos. `font-feature-settings` com `tnum` em qualquer número que se alinhe em coluna: preço, data, contagem.

### Escala

| Token | Família | Mobile | Desktop | Entrelinha | Tracking |
|---|---|---|---|---|---|
| `display-xl` | Fraunces | 44 | 64 | 1.02 | −0.025em |
| `display-l` | Fraunces | 32 | 40 | 1.1 | −0.02em |
| `title` | Fraunces | 24 | 28 | 1.2 | −0.015em |
| `heading` | Inter 600 | 18 | 18 | 1.35 | −0.01em |
| `body` | Inter 400 | 16 | 16 | 1.55 | 0 |
| `body-s` | Inter 400 | 14 | 14 | 1.5 | 0 |
| `meta` | Inter 400 | 13 | 13 | 1.45 | 0 |
| `label` | Inter 500 | 12 | 12 | 1.4 | **0.12em, caixa alta** |

O `label` em caixa alta com tracking largo é o elemento mais reconhecível da marca. Usar em rótulo de campo, categoria, cabeçalho de seção e status. Não usar em frase.

Nunca menos de 12px. Nunca Fraunces abaixo de 20px.

---

## 4. Espaço, raio, elevação

**Espaçamento** em múltiplos de 4: `4 8 12 16 20 24 32 40 56 72`. Respiro entre seções nunca abaixo de 32 no mobile.

**Raio**: `sm 6` para campo e chip, `md 10` para botão e card pequeno, `lg 14` para card de conteúdo e sheet, `full` para pill e avatar. Nada acima de 14 — bolha arredondada é o visual genérico que a especificação proíbe.

**Elevação**, em três níveis e só três:

- `flat` — sem sombra, borda `--border`. É o padrão. Card de ideia é flat.
- `raised` — sombra curta e baixa opacidade, para menu e popover.
- `overlay` — sombra ampla e difusa, exclusivo de sheet e dialog, sempre acompanhado de scrim.

Proibido: sombra colorida, sombra dupla, brilho, borda de gradiente, `backdrop-filter`.

**Foto** ocupa a largura toda do seu container, sem raio no topo quando encosta na borda da tela. Proporções permitidas: `4/5` no card de ideia, `16/9` no destaque da home, `1/1` na grade de galeria. Sempre com `next/image`, `alt` escrito, e um plano de fundo `--surface-sunken` enquanto carrega.

---

## 5. Movimento

| Token | Duração | Curva | Uso |
|---|---|---|---|
| `micro` | 120ms | `cubic-bezier(0.2, 0, 0, 1)` | hover, press, checkbox |
| `standard` | 200ms | `cubic-bezier(0.2, 0, 0, 1)` | troca de estado, fade |
| `enter` | 320ms | `cubic-bezier(0.16, 1, 0.3, 1)` | sheet, dialog, entrada de página |

Anima-se `opacity` e `transform`. Nada mais. Sem animação de `height`, `width` ou `background-color` em lista.

Com `prefers-reduced-motion: reduce`, toda transição de transform é anulada e sobra fade de 100ms. Isso é implementado uma vez, na camada de tokens, e não repetido componente a componente.

Animação decorativa em loop não existe no produto.

---

## 6. Componentes

### Origem

`shadcn/ui` entra **somente onde o valor é o comportamento do Radix**: `Sheet`, `Dialog`, `Select`, `Popover`, `Tooltip`, `DropdownMenu`. Acessibilidade de foco, escape e portal não se reescreve à mão.

Botão, campo, card, badge, skeleton e estado vazio são escritos do zero contra os nossos tokens. São trinta linhas cada e não têm aparência default para brigar. Instalar shadcn para isso significaria importar um segundo sistema de tokens (`--background`, `--primary`) competindo com o nosso.

Onde shadcn for usado, os tokens dele são remapeados para os nossos. Não pode existir dois vocabulários de cor no projeto.

### Inventário do B1

| Componente | Variantes | Estados obrigatórios |
|---|---|---|
| `Button` | `primary` (coral), `secondary` (borda), `ghost`, `danger` | default, hover, active, focus-visible, disabled, loading |
| `IconButton` | `ghost`, `solid` | idem, com `aria-label` obrigatório |
| `Input` / `Textarea` | — | default, focus, error, disabled, com rótulo `label` e mensagem de erro |
| `Card` | `flat`, `media` (com foto) | default, hover (só quando clicável), pressed |
| `StatusPill` | um por status do produto | — |
| `Badge` | `neutral`, `accent`, `positive` | — |
| `Skeleton` | linha, bloco, mídia | respeita reduced-motion |
| `EmptyState` | — | ícone Lucide, título Fraunces, uma frase, uma ação |
| `Sheet` | bottom (mobile) | abre, fecha, arrasta, trava scroll, devolve foco |
| `Dialog` | centro (desktop) | idem |

Alvo de toque mínimo 44px em tudo que é clicável, mesmo quando o desenho parecer menor — a área cresce por padding invisível, não pelo pixel visível.

Foco visível sempre, com anel `--ring` de 2px e offset de 2px. Remover outline sem substituir é proibido.

### StatusPill

Mapeamento fixo, em português na interface:

| Status | Rótulo | Cor |
|---|---|---|
| `idea` | Ideia | neutro, `--text-muted` sobre `--surface-sunken` |
| `deciding` | Decidindo | `--accent` como ponto, rótulo em `--text` |
| `planned` | Planejado | `--positive` |
| `reserved` | Reservado | `--positive`, com ícone |
| `completed` | Realizado | `--text` sobre `--surface-sunken` |
| `cancelled` | Cancelado | `--text-muted`, com riscado no título associado |

---

## 7. App shell

### Mobile

Bottom nav fixa, cinco posições, com `padding-bottom` de safe-area: **Início · Ideias · `+` · Agenda · Memórias**.

O `+` é o único elemento coral da barra, circular, elevado meio passo acima da barra. Os outros quatro são ícone Lucide com rótulo `label` embaixo, coral apenas quando ativo.

Esta é a navegação definitiva. A prancha de marca mostra outra coisa (Início/Calendário/Planejar/Favoritos/Mais) e está errada — ver D-004.

### Desktop

Sidebar fixa à esquerda, 240px, fundo `--surface`, fio à direita: **Início · Ideias · Planos · Calendário · Memórias**, com um botão `Novo DATE` no topo e perfil no rodapé.

Desktop não é mobile esticado. Conteúdo em coluna máxima de 1120px, grade de ideias em 3 colunas, e o painel de detalhe abre ao lado em vez de virar página cheia sempre que couber.

---

## 8. Escrita

Segunda pessoa, direto, sem entusiasmo fabricado. "Nenhuma ideia salva ainda" e não "Ops! Parece que aqui está vazinho 😊".

Estado vazio diz o que aconteceu e oferece uma saída. Erro diz o que falhou e o que fazer. Carregando não fala nada — usa skeleton.

Sem emoji em qualquer lugar da interface. Sem exclamação, salvo em confirmação genuína de algo bom.

---

## 9. Proibições

Glassmorphism · brilho neon · gradiente como plano de fundo · `backdrop-filter` · sombra colorida · emoji como ícone · card dentro de card · raio acima de 14px · coral em texto · animação em loop · ícone sem rótulo em navegação · outline de foco removido · texto abaixo de 12px · cor como único portador de significado.
