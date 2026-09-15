DATE — Reações e atividade

Documento normativo do B10.

1. Princípio

Os quatro pilares estão fechados. Este bloco não acrescenta um quinto: ele acrescenta a presença da outra pessoa.

Favorito, "quero muito" e o feed respondem à mesma pergunta, que hoje o produto não responde:

O que a outra pessoa andou fazendo aqui?

Duas pessoas usando o mesmo app em horários diferentes precisam de um jeito de descobrir que alguém votou, reservou ou se animou com uma ideia — sem que isso vire notificação, chat ou rede social, que o DATE_PROJECT_SPEC.md proíbe nas seções 2 e 4.17.

E o "Escolhe pra gente" responde ao caso oposto: quando nenhum dos dois quer decidir.

2. Por que existem dois tipos de reação

A seção 4.12 do spec pede favorito e "quero muito", e a pergunta óbvia é por que dois. Se a resposta for "um é mais forte que o outro", são o mesmo botão com dois pesos e um deles sobra.

A resposta é que eles têm públicos diferentes:

	O que significa	Para quem
Favorito	"quero achar isso depois"	para você
Quero muito	"olha isso"	para a outra pessoa

Favorito é organização pessoal. É o que alimenta o filtro "meus favoritos" em /ideias, e é silencioso.

"Quero muito" é uma mensagem. É a coisa mais próxima de conversa que este produto tem, e por isso ela aparece no card e emite evento, enquanto favoritar não emite nada.

Essa distinção decide todo o resto deste documento. Se ela se perder, sobram dois botões idênticos.

3. Reações

Uma linha por pessoa, por plano, por tipo. Único em (plano, pessoa, tipo).

as duas reações são visíveis para as duas pessoas, como o voto do B6 e a avaliação do B9;
reagir de novo retira, como o voto;
o filtro de favoritos em /ideias é o dos seus favoritos, não a união dos dois. O nome da coisa é "meus favoritos", e um filtro que trouxesse os favoritos da outra pessoa seria outra funcionalidade com o mesmo rótulo;
"quero muito" aparece como marca no card, para as duas pessoas;
reação não muda status de plano, nem é pré-condição de nada.

O filtro mora na URL: /ideias?favoritos=1. Navegação, não estado de cliente, como tudo desde o B4.

4. O feed
Onde ele vive

Por plano, no detalhe, numa seção discreta ao final: "o que aconteceu".

Não existe aba nova. A navegação tem cinco lugares — Início, Ideias, +, Agenda, Memórias — e nenhum deles é para log. Uma sexta aba chamada "Atividade" seria a coisa mais parecida com painel administrativo que este produto teria, depois de um rebrand inteiro gasto para fugir disso.

E é por plano porque é assim que se usa: você abre o plano e quer saber o que a outra pessoa fez nele desde a última vez. Um feed global responde a uma pergunta que ninguém faz.

A Home pode ganhar um bloco curto de atividade recente entre planos — está abaixo da linha de corte.

O que ele não é

Não é chat. Não tem resposta, não tem reação a evento, não tem menção, não tem "visto por". Não tem notificação, que é B11 no máximo e provavelmente nunca.

5. O problema que define este bloco

O feed é a única tela do produto que fala sobre coisas que podem não existir mais.

Alguém sugeriu uma data na terça e apagou na quarta. O evento fica; a opção não. Para escrever "Nina sugeriu 14 de junho", o feed precisa da data — e ela foi embora com a linha.

O mesmo vale para foto removida, item de checklist apagado, gasto excluído.

E isso não aparece em desenvolvimento, porque em desenvolvimento ninguém apaga nada. O caminho da degradação é exatamente o caminho que nunca é exercitado.

A regra

O B6 decidiu, e continua valendo: metadata não carrega texto pronto para exibição, porque rótulo é decisão de apresentação e muda.

O B10 completa a frase: metadata carrega o fato mínimo para o rótulo poder ser escrito depois.

text
fato   →  { startsAt: "2027-06-14T23:30:00.000Z", allDay: false }
rótulo →  "Terça, 14 de junho, 20:30"

O primeiro vai para o banco. O segundo é escrito na hora de mostrar, com as regras de formatação de hoje — que é justamente o que se ganha por não gravar o texto.

Histórico não se reescreve

Os eventos que o B4 ao B9 já gravaram podem não ter o fato mínimo. Não se faz backfill.

Para o sujeito que ainda existe, o backfill seria gravar o valor de hoje como se fosse o de então — que é mentira sobre o passado. Para o sujeito apagado, é impossível.

Então: evento sem o fato degrada, com um texto honesto que diz o que aconteceu sem afirmar o que não se sabe. "Nina sugeriu uma data" em vez de inventar qual.

O inventário vem antes da interface

Antes de escrever uma linha de tela, este bloco levanta o que já está gravado: quais verbos existem no enum, quais foram realmente emitidos, o que cada um pôs em metadata, e o que acontece com cada um quando o sujeito some.

É arqueologia, é chata, e é a única forma de o feed não ser um campo minado.

6. O fato mínimo por verbo

O conjunto abaixo é o alvo. Onde o que está gravado hoje for menor, a correção é nos blocos de origem, e é pequena.

Verbo	Fato mínimo	Situação provável
plano criado	nenhum além do sujeito	ok
status mudou	from, to	ok, do B4
data sugerida	startsAt, allDay	falta startsAt — B6 gravou só optionId e allDay
voto registrado	vote, startsAt	falta startsAt
data confirmada	startsAt	falta startsAt
reservado	estado da reserva	conforme o B8
plano concluído	nenhum	conforme o B9
memória registrada	nenhum	conforme o B9
quero muito	nenhum	novo, deste bloco

A mudança no B6 é de três linhas em features/dates/data/mutations.ts. Faça-a, e diga que fez.

7. Ruído

O vote_cast do B6 emite a cada mudança de voto, de propósito: durante a decisão, mudar de ideia é a negociação acontecendo.

No feed isso vira lixo. Duas pessoas mexendo nos votos de cinco opções produzem quinze linhas em dois minutos, e a história do plano desaparece atrás delas.

O feed mostra o último voto de cada pessoa em cada opção, não a sequência. Colapso na apresentação, não no dado — o evento continua todo gravado, e quem quiser auditar tem tudo.

Nenhum outro verbo colapsa.

8. Escala

Mesma exigência do B9, com um agravante: os eventos apontam para sujeitos de tipos diferentes, e resolver um por um é N+1 espalhado por quatro tabelas.

A forma certa é: buscar a página de eventos, agrupar os ids por tipo de sujeito, uma consulta por tipo, e costurar em memória.

O número de consultas do feed é constante em relação ao número de eventos, e proporcional apenas ao número de tipos de sujeito.

Prova com um fixture em escala: duzentos eventos num plano, contagem de consultas com dez e com duzentos, e o número não muda.

9. Tempo relativo

O feed precisa de "há 3 horas", e o formatRelativeDay do B6 só sabe falar em dias.

A função nova mora em lib/datetime.ts, como todas, e entra no pnpm test:tz. Ela é calculada no servidor, com o now descendo como sempre — relógio de cliente diverge do servidor e produz erro de hidratação, além de mudar sozinho durante a leitura.

Agrupamento por dia, quando houver, é o dia civil do B7. Nenhuma aritmética nova.

10. Escolhe pra gente

A seção 4.13 do spec pede um sorteador com filtros: categoria, teto de preço, cidade, só não realizados, favoritos opcional.

Ele não tem filtros próprios. Ele sorteia entre o que já está na tela de /ideias, com os filtros que a pessoa já aplicou. Um segundo formulário de filtros seria a mesma lógica escrita duas vezes, e o resultado deixaria de ser explicável — sorteado entre o quê?

Sorteio é ação, nunca render

Math.random() durante a renderização de um Server Component re-sorteia a cada revalidação e a cada recarga, e num componente cliente produz divergência de hidratação.

Então: botão → Server Action → sorteia → redirect para o plano escolhido.

O resultado mora na URL, porque o destino é o próprio plano. Recarregar não sorteia de novo, voltar funciona, e mandar o link mostra o mesmo date. É a mesma regra do mês da agenda e da página da timeline.

Sem roleta

O spec fala em "animação curta e elegante", e o mesmo spec proíbe animação gratuita e o design system proíbe spinner (D-019).

Não há contradição se o elegante for a chegada e não a espera: o sorteio é instantâneo e o que aparece é o plano. Uma roleta de cassino seria exatamente a animação gratuita que a seção 11 proíbe, e ainda seria mentira — não há nada acontecendo durante ela.

Sob prefers-reduced-motion, aparece direto.

Nada para sortear

Filtro que não casa com nada devolve uma frase dizendo isso, com o caminho para afrouxar o filtro. Nunca um sorteio vazio, nunca um redirect para lugar nenhum.

11. Interface e texto
o feed é uma lista discreta, não um card por evento. Cinco eventos em cinco caixas seriam o "cards por todo lado sem hierarquia" de sempre;
o ator aparece como "Você" quando é você, e pelo nome quando é a outra pessoa. Ler "Alex confirmou a data" quando Alex é você é o tipo de detalhe que faz o produto parecer alheio;
ícone por verbo é opcional e, se entrar, é Lucide e é decorativo — o texto diz tudo sozinho;
"quero muito" no card é marca discreta, distinguível por forma, não só por cor;
favorito e "quero muito" são botões com aria-pressed, alvo de 44px, e rótulo que muda de estado ("Favoritar" / "Remover dos favoritos");
feed vazio num plano recém-criado: uma linha só, e sem drama. O plano acabou de nascer; não há história ainda.

O docs/DESIGN_SYSTEM.md na versão do R1 manda sobre cor e tipografia.

12. Banco ou aplicação
Regra	Onde	Por quê
única reação por (plano, pessoa, tipo)	banco	estado impossível
tipo de reação no enum	banco	vocabulário fechado
colapso de votos no feed	aplicação, na apresentação	é decisão de exibição, e o dado fica inteiro
fato mínimo no metadata	aplicação, na escrita	formato de metadata é jsonb, e validá-lo no banco custaria mais do que vale
degradação de evento antigo	aplicação, na leitura	
13. O que não existe na V1

Notificação, push, e-mail, "visto por", resposta a evento, reação a evento, menção, comentário, feed global com aba própria, filtro do feed, exportar histórico, desfazer pelo feed.

Estatísticas

A seção 4.16 do spec é explicitamente fase posterior e não entra aqui.

Ela também é a funcionalidade mais dispensável da V1 e a mais perigosa: total de dates, gastos por categoria, cidades, média de avaliações e "mais bem avaliado" é literalmente a definição de painel, num produto que gastou um rebrand inteiro fugindo de parecer painel.

A recomendação é adiar para depois da V1 e, se voltar, voltar como uma frase por ano dentro da timeline — "em 2026 vocês fizeram 34 dates" — e não como uma tela de números. A decisão é do proprietário.
