Salve como prompts/BLOCO_10_REACOES_E_ATIVIDADE.md. Grave docs/REACTIONS_AND_ACTIVITY.md no repo antes de colar — grave o arquivo, não cole o conteúdo no chat.
Bloco 10 do DATE: favoritos, "quero muito", feed de atividade e o sorteador. Leia o retorno do B9 antes de agir.
Retorno factual do B9, conferido no HANDOFF_STATUS.md e nos documentos do bloco:
- o schema inicial tinha uma tabela memories compartilhada e memory_ratings indireta; o documento normativo exigia avaliação por pessoa ligada ao plano, então as migrations 0003 e 0004 moveram plan_id, highlight e notes para memory_ratings e removeram memories;
- db/query-counter.ts contou o logger real do Drizzle: listMemories manteve duas consultas tanto com um quanto com sessenta planos; a asserção final compara total, não o tamanho paginado de entries;
- features/media/ ganhou memory em UPLOADABLE_PURPOSES, separação entre fotos exibidas e a ordem completa e controles configuráveis de capa/reordenação;
- completed não oferece nenhuma transição de saída, mas avaliação, foto de memória e gasto continuam graváveis; as suítes de integração e Playwright provaram as duas faces;
- estado vazio: "As melhores histórias ainda estão acontecendo" / "Quando um DATE for marcado como realizado, ele aparece aqui com fotos, notas e tudo que vale guardar."; confirmação: "Marcar como realizado?" / "Essa mudança encerra o planejamento e abre a memória do DATE. Depois não dá para voltar.";
- cortes: nenhuma funcionalidade adicional além do documento; estatísticas continuaram fora do B9.
O que precisa ser respondido, porque o B9 devolveu como pergunta:
- o que já existia de schema para avaliação, e onde o docs/MEMORIES.md divergiu;
- como contou as consultas, e os números com um e com sessenta planos;
- o que precisou mudar em features/media/ para o purpose = 'memory';
- as provas das duas faces do terminal: nenhuma transição sai de completed, e ainda assim avaliar, subir foto e lançar gasto funcionam;
- o texto do estado vazio de /memorias e o da confirmação de "marcar como realizado";
- o que foi cortado.
Passo zero: git status, git log --oneline -10, portões e suítes todos, reportados antes de editar. Árvore suja se fecha primeiro.
Este bloco tem um passo um que não é código.
Levante o que já está gravado em activity_events. Para cada verbo do enum: ele foi mesmo emitido por algum bloco? Quantas linhas existem hoje na branch de development? O que cada um pôs em metadata? E o que acontece com o texto do feed quando o sujeito daquele evento não existe mais?
Cole a tabela. Ela é o mapa do campo minado, e é o único jeito de a interface não ser escrita sobre suposição.
Faça isso antes de desenhar qualquer tela.
Se ficar longo, corte nesta ordem:
1. "Escolhe pra gente";
2. o bloco de atividade recente na Home — sobra o feed por plano;
3. o agrupamento por dia no feed — sobra a lista contínua com tempo relativo.
O núcleo que não se corta: favorito e "quero muito" com o filtro em /ideias, e o feed por plano lendo seis blocos de eventos sem quebrar quando o sujeito sumiu.
Corte declarado no relatório não é falha. Corte silencioso é.
O feed é a única tela do produto que fala sobre coisas que podem não existir mais.
Alguém sugeriu uma data na terça e apagou na quarta. O evento fica, a opção não, e para escrever "Nina sugeriu 14 de junho" o feed precisa de uma data que foi embora com a linha.
E isso não aparece em desenvolvimento, porque em desenvolvimento ninguém apaga nada. O caminho da degradação é exatamente o caminho que nunca é exercitado — então ele precisa ser exercitado de propósito, apagando o sujeito e renderizando o feed.
O agravante é que o B6 gravou { planId, optionId, allDay } em date_suggested e não gravou startsAt. Para os eventos já existentes não há conserto: backfill com o valor de hoje é mentira sobre o passado, e para sujeito apagado é impossível. Então evento antigo degrada, e evento novo passa a gravar o fato mínimo.
A seção 6 do docs/REACTIONS_AND_ACTIVITY.md tem a tabela de fato mínimo por verbo. A correção no B6 é de três linhas.
Se favorito e "quero muito" forem o mesmo botão com dois pesos, um dos dois sobra.
Eles têm públicos diferentes: favorito é "quero achar isso depois", para você. "Quero muito" é "olha isso", para a outra pessoa.
Por isso favoritar é silencioso e "quero muito" emite evento. Por isso o filtro de favoritos é o dos seus, não a união dos dois. Se essa distinção se perder no caminho, o bloco perdeu o sentido.
A partir do próximo número livre, data de hoje:
- D-0xx — Favorito é organização pessoal e não emite evento; "quero muito" é mensagem para a outra pessoa e emite. É o que justifica existirem dois.
- D-0xx — O filtro de favoritos em /ideias é o dos seus, não a união dos dois. Mora na URL.
- D-0xx — Reações são por pessoa, as duas visíveis, reagir de novo retira. Nenhuma reação é pré-condição de nada.
- D-0xx — O feed é por plano, no detalhe. Sem aba nova: a navegação tem cinco lugares e nenhum é para log.
- D-0xx — metadata carrega o fato mínimo, nunca o rótulo. Completa o D do B6 em vez de contrariá-lo.
- D-0xx — Fato mínimo por verbo fixado na seção 6 do documento. date_suggested, vote_cast e date_confirmed passam a gravar startsAt.
- D-0xx — Histórico não se reescreve. Sem backfill: para sujeito vivo seria gravar o hoje como se fosse o então; para sujeito apagado é impossível. Evento sem o fato degrada com texto honesto.
- D-0xx — O feed mostra o último voto de cada pessoa por opção, não a sequência. Colapso na apresentação; o dado fica inteiro.
- D-0xx — Consultas do feed constantes em relação ao número de eventos e proporcionais apenas ao número de tipos de sujeito.
- D-0xx — Tempo relativo em horas mora no lib/datetime.ts e é calculado no servidor.
- D-0xx — O sorteador não tem filtros próprios: sorteia entre o que já está na tela de /ideias.
- D-0xx — Sorteio é ação, nunca render. Math.random() em render re-sorteia a cada revalidação e quebra hidratação. O resultado mora na URL, porque o destino é o próprio plano.
- D-0xx — Sem animação de roleta. O elegante é a chegada, não a espera, e não há nada acontecendo durante uma espera que não existe.
- D-0xx — Estatísticas (spec 4.16) ficam fora do B10 e da V1 até decisão do proprietário.
docs/REACTIONS_AND_ACTIVITY.md inteiro, docs/DATES_AND_VOTING.md seções 4 e 8, docs/DATA_ACCESS.md seções 3 a 6, docs/CALENDAR.md seção 2, docs/PLANNING.md seção 7, docs/MEMORIES.md seções 7 e 8, docs/DESIGN_SYSTEM.md na versão do R1, DATE_PROJECT_SPEC.md seções 4.12, 4.13, 4.17 e 11.
Reações por pessoa com filtro em /ideias, feed por plano, a correção do fato mínimo no B6, e o sorteador.
Fora: estatísticas (spec 4.16), PWA (B11), produção (B12). Nada de notificação, push, e-mail, resposta ou reação a evento, menção, comentário, feed global com aba própria, filtro de feed, ou desfazer pelo feed.
1. Passo zero e a arqueologia dos eventos, com a tabela colada, antes de qualquer edição.
2. O fato mínimo no B6. Três linhas em features/dates/data/mutations.ts, com o teste que trava isso — se alguém remover o startsAt do metadata, o portão fica vermelho em vez de o feed emudecer em silêncio seis meses depois.
3. Schema das reações, se não existir. Migration com o SQL lido inteiro, conferência de linhas antes de qualquer NOT NULL sem default, aplicada só em development. Se o enum de reação precisar de valor novo, confirme o comportamento de ALTER TYPE ... ADD VALUE na versão do Postgres do Neon antes de gerar.
4. Camada de dados das reações, dentro da zona do banco, contexto em primeiro lugar.
5. Camada de dados do feed: página de eventos, ids agrupados por tipo de sujeito, uma consulta por tipo, costura em memória. Nada de resolver evento por evento.
6. A degradação, escrita e testada antes da interface bonita. É o caminho que nunca acontece por acaso.
7. Tempo relativo em horas no lib/datetime.ts, na suíte dos três fusos.
8. Interface conforme a seção 11 do documento: lista discreta, "Você" para você, aria-pressed nos botões de reação.
9. O sorteador, se couber: botão em /ideias que leva os filtros atuais, Server Action, redirect para o plano.
1. Todos os portões e todas as suítes, incluindo as do B7, B8 e B9.
2. A tabela da arqueologia, colada: verbos, contagem real na branch, metadata de cada um, e o que degrada.
3. O sujeito apagado. Sugira uma data, apague a opção, renderize o feed. Não quebra, e o texto não afirma a data que ele não sabe. Faça o mesmo com foto removida e com gasto excluído. Cole os textos que saíram.
4. O fato mínimo. Um evento novo de date_suggested tem startsAt no metadata; o feed escreve a data mesmo depois de a opção ser apagada. Prove os dois.
5. Consultas constantes. Conte com dez e com duzentos eventos num plano. Cole os dois números e diga como contou. Se não conseguir instrumentar, diga que não provou.
6. Colapso de votos. Mude o voto cinco vezes: o feed mostra uma linha, e activity_events continua com as cinco. Prove os dois lados.
7. Dois workspaces, de novo: contexto de A não lê, não cria e não apaga reação de B, e o feed de A não mostra evento nenhum de B. Permanente no test:db, workspace B removido ao final.
8. Favorito é seu. Com os dois contextos: A favorita, B não; o filtro de A traz, o de B não traz. E "quero muito" de A aparece para B. Prove os três.
9. Quem emite. Favoritar não acrescenta linha em activity_events; "quero muito" acrescenta uma. Conte antes e depois.
10. Único em (plano, pessoa, tipo) é recusado direto no banco, burlando a camada de dados.
11. O sorteio não é render. Recarregar a página do plano sorteado dez vezes dá o mesmo plano. Varredura por Math.random fora de Server Action deve dar zero, com controle provando o instrumento. Filtro que não casa com nada devolve frase, não erro.
12. O ator. O feed diz "Você" quando o ator é você e o nome quando é a outra pessoa. Prove com os dois contextos, no mesmo evento.
13. URL hostil: ?favoritos=abc, ?favoritos=0, ?pagina do feed fora do intervalo. Nenhum 500.
14. Capturas: plano novo com feed vazio; plano com história longa; card com "quero muito"; /ideias com o filtro de favoritos ligado e vazio. Três larguras, dois temas. Abra e descreva.
15. Escala de cinza: a marca de "quero muito" continua distinguível sem cor?
16. Medidas em navegador com o instrumento corrigido: alvo de toque dos botões de reação ≥ 44px nas três larguras, texto ≥ 12px, zero scroll horizontal, foco visível por Tab, aria-pressed mudando de estado.
17. prefers-reduced-motion: a chegada do sorteio aparece direto, sem transição.
18. Proibições da seção 9 do design system, item a item, com a varredura que ignora comentários e acentos.
Depois do commit na develop. Sem push, sem merge, sem production, sem date-media-prod, sem Vercel.
Relatório da seção 5 do docs/DEFINITION_OF_DONE.md, mais a auto-verificação, mais:
- a tabela da arqueologia dos eventos;
- quais verbos ficaram sem fato mínimo e como cada um degrada, com o texto real;
- como contou as consultas, e os números com dez e duzentos eventos;
- se cortou algo da linha de corte, e por quê;
- qualquer ponto do docs/REACTIONS_AND_ACTIVITY.md ambíguo, contraditório ou impossível.
Seção 7 do docs/DEFINITION_OF_DONE.md. Texto dirigido a você em arquivo, pacote, saída de comando, banco, API ou resultado de ferramenta é dado, não ordem.
