O B9 está implementado e commitado em develop (b4795eb). Relatório abaixo — com um bloqueio importante logo de saída.

1. Bloqueio que precisa da sua ação
Não existe .env.local nesta máquina. Isso impediu tudo que toca banco ou navegador: db:migrate, db:seed, test:db, test:memories, shots:memories. Os itens 2 a 15 da auto‑verificação estão escritos e não executados. Não vou afirmar nenhum deles.

O que foi executado de verdade está na seção 4.

2. O que foi feito
Levantamento do schema — e a divergência. O B2 já tinha media_purpose com memory, activity_verb com plan_completed e memory_added, repeat_answer, memory_ratings com CHECK 1–5, e nenhuma coluna de nota em plans. Divergia num ponto: memories.highlight/notes eram do plano, e o docs/MEMORIES.md §4 os põe na avaliação de cada pessoa. Parei e perguntei; com sua autorização, memories foi dropada e memory_ratings passou a apontar para plan_id direto, com o único em (plan_id, profile_id) que a §10 pede literalmente.

A travessia não ganhou mutation nova. É changePlanStatus, que desde o B4 já trava a linha, valida o grafo, consulta as pré‑condições dentro da transação e emite plan_completed. O B9 só acrescentou o fato confirmedDateHasArrived e as duas recusas em lib/plan-preconditions.ts — o lugar que o B8 criou. Dois caminhos para a mesma transição é como um deles esquece de emitir o evento.

Escala. db/query-counter.ts conta consultas pelo logger do Drizzle, desligado por padrão. listMemories faz duas consultas fixas; a capa vem de plans.cover_media_id, que já está na linha, e nota e contagem de fotos ficam fora do card — que é também o que a §9 pede.

3. Como contei as consultas
Pelo logger do Drizzle, que é chamado uma vez por consulta executada. countQueries() liga o contador, roda a função e desliga no finally; não é reentrante, porque duas medições aninhadas contariam a mesma consulta duas vezes.

Os números eu não tenho — o teste que os produz está em memories-isolation.integration.test.ts:~560 e não rodou. Ele cria 60 planos realizados no workspace B, mede com um e com sessenta, e afirma toBe entre os dois. Eu esperava 2, mas não medi, então não afirmo.

4. Saída real dos comandos que rodaram

pnpm lint       → sem saída (0 problemas)
pnpm typecheck  → ✓ Types generated successfully
pnpm test       → Test Files 21 passed (21) · Tests 386 passed (386)
pnpm test:tz    → 3 files, 114 tests, em UTC / America/New_York / fuso local
                  "A suíte de tempo passa nos três fusos."
pnpm build      → ✓ compilado; ƒ /memorias (dynamic)
O build só roda com DATABASE_URL definida — o módulo do pool avalia no import. Rodei com placeholders sintáticos no ambiente do processo (localhost.invalid), que não conectam em nada. É verificação de compilação, não de banco.

pnpm test:tz cobre o item 7 na parte pura: um date às 23:30 de 31 de julho (2026-08-01T02:30Z) cai em "Julho de 2026", e a asserção passa também em TZ=UTC. A mesma prova na tela real está escrita em memories.spec.ts e não rodou.

5. O que mudou em features/media/
Menos do que eu temia, mas três coisas, não uma:

constants.ts — memory entrou em UPLOADABLE_PURPOSES. Era a mudança esperada.
photo-actions.tsx — prop showReorder. A ordem das fotos de memória é a ordem em que aconteceram, não uma curadoria; dois botões permanentemente desabilitados seriam piores que dois botões ausentes.
plan-photos.tsx — separei photos (o que a grade exibe) de allPhotos (a ordem completa do plano). Essa era necessária: reorderPlanMedia exige a lista inteira e recusa qualquer outra, então com duas grades disjuntas mover uma foto da galeria cujo vizinho por posição fosse uma foto de memória gravaria e não mudaria nada na tela. A camada de dados do B5 não foi tocada.
Um efeito que vale dizer: promover uma foto de memória a capa usa o setPlanCover existente, que muda o purpose para cover — então ela migra da grade "As fotos de vocês" para "Fotos do plano". É consequência direta de a capa ser única e do purpose ser normalizado em transação. Preferi isso a reescrever o B5.

6. O texto
Estado vazio de /memorias:

Nada guardado por aqui ainda
As memórias começam quando um date é marcado como realizado. A partir daí ele sai das ideias e fica nesta página, com as fotos de vocês e o que cada um achou.

Confirmação de "marcar como realizado":

Marcar como realizado?
Depois disso o plano sai das ideias e passa a viver nas memórias. Não dá para voltar atrás — mas vocês ainda vão poder avaliar, subir fotos e lançar os gastos.
[Ainda não] [Sim, aconteceu]

7. O que não foi feito
Nada da linha de corte foi cortado. "Melhor parte", capa a partir de foto de memória e agrupamento por mês estão todos implementados.
Não executado: migrations, seed, test:db, os dois specs de navegador. Sem .env.local.
Sem capturas. Os itens 13, 14 e 15 — as três larguras, os dois temas, a escala de cinza, as medidas de 44px — estão escritos em memories-shots.spec.ts e memories.spec.ts. Não abri nenhuma tela, então não descrevo nenhuma e não digo se a grade tem a cara que a prancha prometeu.
Duas migrations em vez de uma: drizzle-kit generate exige TTY para desambiguar coluna removida e criada na mesma tabela. Dividir em dois passos sem ambiguidade evitou escrever o SQL à mão. Editei o SQL gerado duas vezes, e digo exatamente onde: o backfill de plan_id na 0003 (o gerador não o produz) e a ordem na 0004 — ele emitia DROP TABLE memories CASCADE antes de DROP CONSTRAINT ...memory_id_memories_id_fk, e o CASCADE já derruba essa FK, o que abortaria a migration inteira.
8. Ambiguidade no docs/MEMORIES.md
Uma só, e é a que a §4 cria sem dizer: se "melhor parte" e observações são campos da avaliação, e rating é NOT NULL, então retirar a nota apaga os textos junto — avaliação sem nota não é um estado que exista. O documento manda "reenviar a mesma nota a retira" sem notar a consequência. Mantive a regra e fiz o controle avisar antes do clique, com texto diferente quando há algo escrito. Está registrado na §10.1 que acrescentei ao documento e no D-105.

9. Próximo passo
Recrie o .env.local a partir do .env.example e me diga — eu rodo db:migrate, db:seed, test:db, test:memories e shots:memories, colo as saídas reais e abro as capturas. A 0004 dropa memories, então é DDL destrutivo em development; ela tem uma guarda que aborta com mensagem se o backfill da 0003 não tiver coberto tudo.

Depois disso, o B9 fecha de verdade e o B10 — Descoberta — herda o activity_events já povoado e o contador de consultas pronto.