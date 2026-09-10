# Prompt inicial para Claude Code

Copie e envie a mensagem abaixo ao Claude Code **na raiz do repositório DATE** junto com este pacote de documentação.

---

Você assumirá a implementação do projeto **DATE**.

Antes de executar qualquer comando ou modificar qualquer arquivo:

1. leia integralmente `CLAUDE.md`;
2. leia `AGENTS.md`;
3. leia `DATE_PROJECT_SPEC.md`;
4. leia `HANDOFF_STATUS.md`;
5. leia todos os arquivos em `docs/`;
6. inspecione `public/brand/`;
7. rode `git status` e inspecione o conteúdo atual do repositório.

O produto, a identidade visual e a arquitetura já foram definidos. Não quero que você reinvente a stack ou o design. Seu trabalho é implementar a especificação de forma segura e incremental.

## Estado externo já existente

Não recrie estes recursos:

- GitHub: repositório privado já criado e aberto localmente.
- Neon:
  - projeto `date-app`;
  - região AWS São Paulo (`sa-east-1`);
  - branch `production` como default;
  - branch `development` filha de `production`;
  - Managed Better Auth habilitado;
  - 2FA da conta configurado.
- Cloudflare R2:
  - `date-media-dev`;
  - `date-media-prod`;
  - ambos devem permanecer privados.
- Ambiente local:
  - Git, Node, pnpm, VS Code, Claude Code e Codex estão instalados/atualizados.

## Objetivo desta execução

Você deve conduzir o bootstrap e a implementação por fases, conforme `prompts/BLOCO_00_FUNDACAO.md` e `docs/ROADMAP.md`.

Comece pela fundação. Não faça big-bang.

### Primeiro milestone esperado

1. scaffold do Next.js no repositório existente;
2. TypeScript strict, ESLint, Tailwind e React Compiler conforme compatibilidade atual;
3. preservar esta documentação e assets;
4. instalar apenas dependências aprovadas;
5. estruturar pastas;
6. adicionar scripts de lint/typecheck/test/build;
7. configurar design tokens e fontes DATE;
8. configurar `.env.example`, sem nenhum segredo real;
9. configurar Drizzle para Neon;
10. conectar apenas à branch `development`;
11. preparar Managed Better Auth usando o SDK atual `@neondatabase/auth` — não Stack Auth;
12. criar shell inicial de autenticação customizada e guardas, sem signup público;
13. preparar integração R2 dev sem criar token/bucket novo;
14. configurar manifest PWA e icons fornecidos;
15. criar os primeiros testes de smoke;
16. rodar lint, typecheck, tests e build.

## Interatividade / segredos

Quando uma etapa exigir:
- login de CLI;
- connection string;
- Auth Base URL;
- secret;
- R2 Access Key;
- criação de token no dashboard;
- link/import na Vercel;

não invente valor e não coloque segredo em chat/commit. Explique exatamente o dado/ação necessária e aguarde o proprietário quando for impossível concluir sem interação humana.

Para desenvolvimento, use **somente**:
- Neon `development`;
- R2 `date-media-dev`.

Não conecte o localhost à produção.

## Auth

O painel atual do Neon avisa que signups restritos ainda não são configuração nativa. A aplicação não deve expor signup. Antes do lançamento, a arquitetura exige um webhook `user.before_create` do Managed Better Auth para permitir somente os e-mails da allowlist, além das guardas de autorização internas. Siga a documentação oficial atual para assinatura e resposta do webhook.

## Migrations

Não crie tabelas pelo Console.

Use Drizzle code-first + migrations versionadas. Nunca aplique migrations em `production` durante o bootstrap.

## Forma de trabalho

Após cada milestone:
- mostre resumo do que fez;
- liste comandos executados;
- liste arquivos criados/alterados;
- mostre resultado de lint/typecheck/test/build;
- informe bloqueios reais;
- proponha o próximo milestone;
- não afirme que algo funciona sem testar.

Se detectar divergência entre esta documentação e uma versão atual de Next.js/Neon/Drizzle, mantenha a intenção arquitetural e consulte documentação oficial atual antes de escolher a API compatível. Documente a divergência.

Agora comece pela inspeção do repositório e execute o bootstrap seguro.
