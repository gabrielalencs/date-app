# DATE — Project Specification

Versão: **1.0**
Data: **10/09/2026**
Status: **arquitetura e produto aprovados; código ainda não iniciado**

## 1. Visão

DATE é um sistema privado para um casal organizar experiências juntos. Ele começa como organizador de ideias e agenda e, com o tempo, torna-se também um arquivo visual de memórias.

O produto tem quatro pilares:

1. **Descobrir** — salvar lugares, links, inspirações e favoritos.
2. **Decidir** — comparar datas, votar, estimar custos e definir prioridade.
3. **Planejar** — confirmar data, reservar, acompanhar checklist e gastos.
4. **Lembrar** — registrar fotos, avaliações, timeline e estatísticas.

A sensação desejada é uma combinação de:
- descoberta visual de Airbnb/Instagram;
- organização leve de calendário;
- lógica de status inspirada em Trello;
- linguagem editorial/lifestyle própria.

Não copiar interfaces ou marcas desses produtos.

## 2. Usuários

O sistema é **privado e destinado a exatamente duas pessoas na V1**.

Não existe:
- cadastro público;
- perfil público;
- social feed público;
- seguidores;
- chat interno;
- planos pagos;
- administração multi-tenant genérica.

A arquitetura usa `workspace` para manter autorização correta e não espalhar condicionais por e-mail no código.

## 3. Fluxo principal

```text
link / ideia
   ↓
IDEIA
   ↓
datas possíveis
   ↓
votos dos dois
   ↓
data confirmada
   ↓
PLANEJADO
   ↓
reserva / checklist / orçamento
   ↓
REALIZADO
   ↓
fotos + avaliação + gastos
   ↓
MEMÓRIA
```

## 4. Funcionalidades

### 4.1 Login
- E-mail + senha.
- Tela totalmente customizada com identidade DATE.
- Sem botão "Criar conta".
- Sem login social na V1.
- Somente dois usuários autorizados.
- Transição visual suave do hero/login para a Home.
- Logout e controle de sessão.

### 4.2 Home
- Saudação discreta.
- Próximo DATE em destaque com imagem grande.
- Data/horário, local e contagem regressiva.
- Bloco "Para decidir".
- Ideias recentes.
- Pequeno resumo do mês; não criar dashboard corporativo.

### 4.3 Ideias
- Grid/lista visual de planos ainda não realizados.
- Capa, título, localização, categoria, faixa/estimativa de preço e status.
- Favoritos.
- Busca e filtros.
- Ordenação recente / prioridade / preço.

### 4.4 Criar / editar DATE
Cadastro rápido primeiro; detalhes opcionais depois.

Campos previstos:
- título;
- descrição;
- categoria;
- capa;
- galeria;
- local;
- endereço;
- cidade/UF/país;
- coordenadas opcionais;
- link de origem;
- links adicionais;
- possíveis datas;
- horário/duração;
- prioridade;
- orçamento estimado;
- observações;
- necessidade de reserva;
- dados de reserva;
- checklist.

### 4.5 Links
Tipos:
- Instagram
- TikTok
- site
- Google Maps
- Waze
- reserva
- ingresso
- Airbnb/Booking
- outro

Open Graph preview é melhoria posterior ao CRUD; não bloquear MVP por scraping de terceiros.

### 4.6 Datas e votação
- Um plano pode ter várias opções de data.
- Cada usuário vota `sim`, `talvez` ou `não`.
- Mostrar visualmente consenso.
- Uma opção pode ser promovida a data oficial.
- Confirmar data altera o status conforme regra de negócio.

### 4.7 Status
Estados previstos:
- `idea`
- `deciding`
- `planned`
- `reserved`
- `completed`
- `cancelled`

A interface pode usar rótulos em português:
Ideia → Decidindo → Planejado → Reservado → Realizado.

### 4.8 Calendário
- Visão mensal, seis linhas sempre, semana começando na segunda-feira.
- Dates confirmados com destaque.
- Opções de data com aparência secundária.
- Abrir detalhes em **painel**: abaixo da grade no mobile, ao lado no desktop. Não sheet, não modal — modal é só para confirmação destrutiva (D-080).
- Mês e dia moram na URL; a agenda é navegação, não estado de cliente (D-078).
- Fuso padrão: `America/Sao_Paulo`.

**Adiado, fora da V1 do calendário:** adicionar plano a partir do dia selecionado. Tornaria as 42 células interativas — 42 paradas de tabulação antes do resto da página — por um ganho que `/novo` seguido de sugerir data já entrega (D-077). Só célula com conteúdo é link.

### 4.9 Reservas
- requer reserva?
- status de reserva;
- código;
- horário;
- link;
- observações.

Anexos/vouchers podem entrar depois de o fluxo principal de mídia estar estável.

### 4.10 Checklist
- itens ordenáveis;
- conclusão por qualquer membro;
- registrar quem marcou e quando.

### 4.11 Custos
- orçamento estimado do date;
- itens de gasto real;
- opcionalmente quem pagou;
- resumo do total.

Não transformar o DATE em Splitwise.

### 4.12 Favoritos / quero muito
- reações por usuário;
- filtro de favoritos;
- pode existir reação "quero muito" além de favorito.

### 4.13 Escolhe pra gente
Sorteador determinístico/aleatório baseado em filtros:
- categoria;
- teto de preço;
- cidade;
- somente não realizados;
- favoritos opcional.

Sem IA. A experiência pode ter animação curta e elegante.

### 4.14 Memórias
Depois de `completed`:
- capa;
- galeria;
- data;
- localização;
- avaliação de cada usuário;
- "repetiria?" (`yes`, `maybe`, `no`);
- destaque/melhor parte;
- observações;
- gastos reais.

### 4.15 Timeline
Histórico cronológico de dates realizados por mês/ano.

### 4.16 Estatísticas
Fase posterior:
- total de dates;
- categorias;
- gastos;
- cidades;
- média de avaliações;
- mais bem avaliado.

Manter visual lifestyle; evitar BI corporativo.

### 4.17 Activity feed
Histórico leve:
- criou plano;
- sugeriu data;
- votou;
- confirmou;
- reservou;
- concluiu;
- adicionou memória.

Não é chat.

### 4.18 Tema
- `light`
- `dark`
- `system`

Tema definido por tokens, não por inversão automática.

### 4.19 PWA
- instalável no Android/iPhone;
- ícone DATE;
- `display: standalone`;
- manifest;
- HTTPS via Vercel;
- online-first na V1;
- sem sincronização offline complexa;
- push notifications são melhoria posterior.

## 5. Navegação

### Mobile
Bottom navigation:
- Início
- Ideias
- ação central `+`
- Agenda
- Memórias

Configurações/perfil acessíveis por menu/avatar.

### Desktop
Sidebar:
- Início
- Ideias
- Planos
- Calendário
- Memórias
- Novo DATE
- Perfil/configurações

A versão desktop não é simplesmente a mobile esticada.

## 6. Stack fechada

- Next.js App Router
- React
- TypeScript strict
- Tailwind CSS 4
- shadcn/ui
- Motion
- Lucide React
- React Hook Form
- Zod
- date-fns
- Drizzle ORM
- `@neondatabase/serverless`
- PostgreSQL Neon
- `@neondatabase/auth` com Managed Better Auth
- Cloudflare R2 via API S3
- AWS SDK S3 client/presigner
- Vercel
- Vitest
- Playwright
- pnpm

Não adicionar Nest.js, Redis, Prisma, Firebase, Supabase ou outro backend sem necessidade aprovada.

## 7. Arquitetura

Browser/PWA nunca recebe credenciais de banco ou R2.

```text
PWA / Browser
     |
     v
Next.js on Vercel
  |         |
  |         +--> Cloudflare R2 (private)
  |
  +--> Neon Auth
  |
  +--> Neon PostgreSQL via Drizzle
```

Banco é acessado no servidor. Neon Data API deve permanecer desligada na V1, salvo decisão explícita posterior.

## 8. Ambientes

### Desenvolvimento
- Neon branch: `development`
- R2 bucket: `date-media-dev`

### Produção
- Neon branch: `production`
- R2 bucket: `date-media-prod`

Nunca misturar.

## 9. Segurança

Mínimo obrigatório:
- Neon Auth.
- Nenhum signup exposto na UI.
- `user.before_create` webhook de Neon Auth como bloqueio real de signup por allowlist antes de produção.
- `ALLOWED_EMAILS` server-only.
- `workspace_members` para autorização.
- DB server-only.
- R2 privado.
- Presigned URLs curtas e específicas.
- Zod em toda entrada mutável.
- validação de MIME/tamanho de upload.
- cookies/sessão conforme SDK oficial.
- headers de segurança.
- sem secrets no cliente.
- sem logs de tokens/senhas/connection strings.
- proteção contra IDOR: toda consulta por entidade deve validar o workspace.

## 10. Identidade

Marca: **date**.

**Atualização R1 — 11/09/2026:** a implementação visual do B1 foi substituída por solicitação do proprietário. A referência permanente é `docs/DESIGN_SYSTEM.md`: navy estrutura, coral é accent, sage/blue/blush/taupe dão variedade, cream/sand sustentam o espaço e fotografia tem protagonismo. Usar assets oficiais de logo; controles com linguagem DATE; Select Radix customizado; Motion em wrappers pequenos; temas claro/escuro desenhados por tokens. A hierarquia dos mockups orienta as telas existentes, sem criar funcionalidades ou dados ausentes. B6 já existia na base recebida e foi preservado. Nenhuma mudança de Auth, API, banco ou R2 pertence ao R1.

Símbolo:
- calendário minimalista;
- base com curva que sugere caminho/encontro;
- ponto coral como data/local/momento.

Conceito visual:
- editorial;
- sofisticado sem luxo artificial;
- calor humano;
- fotografia protagonista;
- UI limpa.

Fontes:
- Fraunces: display, wordmark e títulos editoriais.
- Inter: interface, corpo e dados.

Paleta:
- Navy `#1E2D3D`
- Coral `#E76F51`
- Sage `#A7B89F`
- Sand `#F6EDE4`
- Graphite `#282B2B`
- White `#FFFFFF`
- Dark background `#0E171D`
- Dark surface `#15232C`

Pranchas aprovadas:
`public/brand/reference/date-brand-board-initial.png`
`public/brand/reference/date-brand-board-complet.png`

## 11. Direção de UX

Evitar:
- glassmorphism;
- neon/glow;
- gradientes genéricos;
- excesso de blur;
- emojis como ícones principais;
- cards por todo lado sem hierarquia;
- dashboards empresariais;
- copy com cara de IA;
- animações gratuitas.

Priorizar:
- fotografia;
- espaços amplos;
- tipografia;
- microinterações;
- estados de loading/empty/error bem escritos;
- acessibilidade;
- reduced-motion;
- performance mobile;
- touch targets adequados.

## 12. Estratégia de implementação

Não implementar tudo num único passo.

Seguir `docs/ROADMAP.md`.

Cada fase:
1. ler docs;
2. escrever/ajustar schema quando necessário;
3. gerar migration;
4. aplicar somente em `development`;
5. implementar;
6. testar;
7. rodar lint/typecheck/build;
8. registrar mudança;
9. só então avançar.

## 13. Critério de conclusão

O produto final deve:
- funcionar como PWA instalável;
- funcionar bem em mobile e desktop;
- aceitar apenas usuários autorizados;
- manter fotos privadas;
- não depender de reativação manual de banco;
- sobreviver a reloads, sessões expiradas e erros de rede;
- ter build limpo;
- ter testes nos fluxos críticos;
- preservar a identidade aprovada.
