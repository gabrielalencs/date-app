# DATE — Bloco 0: Fundação

Bloco 0 do DATE: Fundação. Você é o implementador. Eu revisei o seu relatório de reconhecimento e respondo abaixo às suas perguntas bloqueantes. Leia tudo antes de rodar o primeiro comando.

## Respostas às perguntas bloqueantes

1. Os 13 arquivos de `docs/` nunca existiram. A estrutura foi reduzida para sete documentos sem prefixo numérico, entregues antes do bloco que consome cada um. Três já estão no repo: `ROADMAP.md`, `DEFINITION_OF_DONE.md` e `DECISION_LOG.md`. Os outros quatro chegam nos blocos B1, B2, B3 e B5. Parte deste bloco é corrigir as referências quebradas no `README.md` e no `CLAUDE.md`.
2. Sim, mover os assets para `public/brand/`. A documentação está certa, os arquivos é que estão no lugar errado.
3. Next.js 16, `next@latest`. React Compiler desligado — ver D-002. Node 22.23.2 atende o mínimo de 20.9.
4. Sim, ative o pnpm por corepack como primeiro passo deste bloco.
5. Este bloco é 100% offline. Nenhuma conexão com Neon, R2 ou Vercel. Nenhum segredo. Se você chegar num ponto que exige credencial, você saiu do escopo.
6. Reportar e seguir, como você fez. Não investigue. A regra permanente está na seção 7 do `DEFINITION_OF_DONE.md`.

## Leitura obrigatória

`CLAUDE.md`, `AGENTS.md`, `DATE_PROJECT_SPEC.md`, `HANDOFF_STATUS.md`, `docs/ROADMAP.md`, `docs/DEFINITION_OF_DONE.md`, `docs/DECISION_LOG.md`.

## Escopo

Deixar o repositório com um Next.js vazio, limpo, tipado e verificável. Nenhuma tela de produto. Nenhum componente de negócio. Nenhum token de design — isso é B1.

## Armadilha conhecida

O `create-next-app` do Next 16 gera um `AGENTS.md` próprio e um `CLAUDE.md` que aponta pra ele. Os dois colidem com os nossos, que não podem ser perdidos. O `next dev` reescreve e reinsere automaticamente um bloco de regras dentro do `AGENTS.md`, entre marcadores.

Decisão já tomada (D-009): o bloco gerenciado pelo Next fica. Preserve o conteúdo do nosso `AGENTS.md` e deixe o bloco do framework conviver com ele, fora do nosso texto. Nunca apague esse bloco manualmente — ele volta.

O nosso `CLAUDE.md` tem precedência e não pode ser sobrescrito. Se o scaffold gerar um, incorpore o que for útil como seção, não substitua.

## Passo a passo

1. `corepack enable` e ative o pnpm. Fixe a versão em `packageManager` no `package.json`.
2. Crie e vá para a branch de trabalho. Nada de push direto em `main`.
3. Scaffold sem conflito. Gere num diretório temporário dentro do repo com `--skip-install`, mova o conteúdo para a raiz resolvendo colisões manualmente, apague o temporário e só então rode `pnpm install` na raiz. Estado desejado: TypeScript, ESLint, Tailwind 4, App Router, Turbopack, alias `@/*`, sem `src/`.
4. `.gitignore` cobrindo `node_modules`, `.next`, `.env*.local`, `out`, `.vercel`, `*.log` e artefatos de teste, antes do primeiro `git add`.
5. Assets para `public/brand/{logos,icons,reference}`. Não gerar os ícones que faltam (B11), não otimizar o PNG da prancha, não alterar os SVGs.
6. Estrutura de pastas com `.gitkeep` onde estiver vazio: `app/`, `components/`, `features/`, `lib/`, `db/`, `docs/`, `prompts/`, `public/`, `tests/`.
7. `tsconfig.json` com `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`. Se o scaffold quebrar, conserte o scaffold, não afrouxe o compilador.
8. `next.config.ts` mínimo, sem `reactCompiler`, com comentário de uma linha apontando D-002.
9. Scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `format`.
10. Vitest apenas, sem Playwright (D-008). Dois testes de fumaça reais: um na rota raiz, outro numa função utilitária escrita em `lib/`.
11. `.env.example` com placeholders para Neon, Auth e R2. Nenhum valor real, nenhum comentário revelando formato de credencial.
12. Corrigir os ponteiros de documentação no `README.md` e no `CLAUDE.md`. Só ponteiros, sem reescrever conteúdo.
13. Commits pequenos, um por unidade lógica. Push da branch.
14. Rodar `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build` e colar a saída real.

## Onde parar

Depois do push da branch. Sem PR, sem merge, sem tocar na Vercel.

## Entrega

Relatório da seção 5 do `DEFINITION_OF_DONE.md`, mais: as flags exatas aceitas pelo `create-next-app`; as versões de `next`, `react`, `tailwindcss`, `typescript` e `vitest`; como a colisão de `AGENTS.md` e `CLAUDE.md` foi resolvida; divergências entre a instrução e o comportamento real das ferramentas; o que foi deixado de fora de propósito.
