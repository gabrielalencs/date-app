import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Link2, MapPin, Wallet } from "lucide-react";
import { ActivityFeed } from "@/features/activity/components/activity-feed";
import { listPlanActivity } from "@/features/activity/data/queries";
import { parseActivityPage } from "@/features/activity/url";
import { EditorialNote } from "@/components/brand/editorial";
import { CategoryArt } from "@/components/brand/category-art";
import { PlanDates } from "@/features/dates/components/plan-dates";
import { listPlanDateOptions } from "@/features/dates/data/queries";
import { PlanPhotos } from "@/features/media/components/plan-photos";
import { PlanReview } from "@/features/memories/components/plan-review";
import { listPlanRatings } from "@/features/memories/data/queries";
import { PlanChecklist } from "@/features/planning/components/plan-checklist";
import { PlanExpenses } from "@/features/planning/components/plan-expenses";
import { PlanReservation } from "@/features/planning/components/plan-reservation";
import {
  getReservation,
  isReadOnly,
  listChecklist,
  listExpenses,
  readPlanFacts,
  reservationAvailable,
} from "@/features/planning/data/queries";
import { MediaImage } from "@/features/media/components/media-image";
import { listPlanMedia } from "@/features/media/data/queries";
import { ArchivePlanForm } from "@/features/plans/components/archive-plan-form";
import { CompletePlanPanel } from "@/features/plans/components/complete-plan-panel";
import { PlanStatusControl } from "@/features/plans/components/plan-status-control";
import { getPlan } from "@/features/plans/data/queries";
import { linkLabel } from "@/features/plans/completeness";
import { FavoriteButton } from "@/features/reactions/components/favorite-button";
import { PlanReactions } from "@/features/reactions/components/plan-reactions";
import { listPlanReactions } from "@/features/reactions/data/queries";
import { requireAuthorizedContext } from "@/lib/auth/authorization";
import { categoryLabel } from "@/lib/categories";
import { NotFoundError } from "@/lib/errors";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/cn";

/**
 * Título da janela com o nome do plano. `getPlan` é memoizado por requisição
 * com cache() do React, então isto não acrescenta consulta: é a mesma leitura
 * escopada por workspace que a página faz logo abaixo. Plano inexistente ou de
 * outro workspace cai no título genérico e a página responde 404 — o título
 * nunca é o lugar que confirma a existência de alguma coisa.
 */
export async function generateMetadata({
  params,
}: PageProps<"/planos/[id]">): Promise<Metadata> {
  const { id } = await params;
  try {
    const ctx = await requireAuthorizedContext();
    const plan = await getPlan(ctx, id);
    return { title: plan.title };
  } catch {
    return { title: "Plano" };
  }
}

export default async function Page({
  params,
  searchParams,
}: PageProps<"/planos/[id]">) {
  const ctx = await requireAuthorizedContext();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const rawPage = Array.isArray(query.pagina) ? query.pagina[0] : query.pagina;
  const activityPage = parseActivityPage(rawPage);
  const plan = await getPlan(ctx, id).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const realizado = plan.status === "completed";

  const [
    photos,
    dateOptions,
    reservation,
    checklist,
    expenses,
    facts,
    ratings,
    reactions,
    activity,
  ] = await Promise.all([
    listPlanMedia(ctx, plan.id),
    listPlanDateOptions(ctx, plan.id),
    getReservation(ctx, plan.id),
    listChecklist(ctx, plan.id),
    listExpenses(ctx, plan.id),
    readPlanFacts(ctx, plan.id),
    /* Avaliações, fotos de memória e gastos são três consultas, não três por
       linha (seção 7 do docs/MEMORIES.md). As fotos já vêm inteiras de
       `listPlanMedia`, e a separação por `purpose` acontece em memória. */
    realizado ? listPlanRatings(ctx, plan.id) : null,
    listPlanReactions(ctx, plan.id),
    listPlanActivity(ctx, plan.id, activityPage),
  ]);

  /* Uma grade só: a **galeria**, que é o registro do que aconteceu.

     Até o R2 eram duas — "Fotos do plano" (a inspiração, antes) e "As fotos de
     vocês" (a memória, depois) —, e a capa entrava e saía de uma delas conforme
     o `purpose`. Na prática ninguém sobe print de restaurante: sobe a capa, e
     depois as fotos do rolê. Duas grades para um uso só é uma delas sempre
     vazia, e uma caixa vazia no meio da página é ruído.

     O filtro é por `purpose`, e não por `coverMediaId`, de propósito: uma foto
     de memória promovida a capa **mantém** `purpose = 'memory'` (D-104) e por
     isso continua na galeria, com o selo de capa. Se o filtro fosse pelo id da
     capa, promover uma foto a capa a faria desaparecer da grade. */
  const galeria = photos.filter((photo) => photo.purpose !== "cover");

  /* Plano cancelado ou arquivado é leitura nas três seções (seção 8 do
     docs/PLANNING.md). A camada de dados recusa de novo — isto aqui é só para
     a tela não oferecer o que seria recusado. */
  const somenteLeitura = isReadOnly(plan);
  /* Memória é fato consumado.
 
     A confirmação de que o date aconteceu é a fronteira: antes dela se planeja,
     depois dela se registra. Checklist, gastos, fotos do plano e os detalhes do
     plano descrevem o que foi combinado — editá-los depois reescreveria o
     passado, e o produto passaria a guardar uma versão do rolê que não é a que
     aconteceu.
 
     O que continua aberto num plano realizado é só o que nasce **depois** dele:
     a avaliação de cada pessoa e as fotos de memória. As duas coisas são a
     memória em si, não o planejamento dela. */
  const planejamentoCongelado = somenteLeitura || realizado;
  const reservaDisponivel =
    plan.requiresBooking && reservationAvailable(plan, facts);
  const now = new Date();
  const cover = photos.find((photo) => photo.id === plan.coverMediaId);
  const meuFavorito = reactions.some(
    (member) => member.isCurrent && member.favorite,
  );

  return (
    <div className="page-stack">
      <Link
        href="/ideias"
        className="text-text-muted flex min-h-11 w-fit items-center gap-2 text-sm"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar às ideias
      </Link>
      {/* Três posições explícitas, e não fluxo automático: no telefone a ordem
          é a do DOM e o rail cai para o fim (`order-last`), enquanto no desktop
          cada bloco declara onde mora. Deixar o rail auto-fluir era o que fazia
          o celular abrir o plano por "Mover o plano" e "Arquivar" - controles
          de administração servidos antes de a pessoa ter lido o que o plano é. */}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <article className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          {cover ? (
            /* 16/8 era uma fresta: uma foto vertical de celular entrava por
               `object-cover` e sobrava uma faixa do meio, sem cabeça nem chão.
               4/3 no telefone e 16/9 a partir do tablet ainda cortam, porque
               capa é recorte — mas cortam pouco, e o assunto continua na foto. */
            <div className="relative aspect-4/3 overflow-hidden rounded-lg sm:aspect-16/9">
              <MediaImage
                mediaId={cover.id}
                alt={`Capa de ${plan.title}`}
                priority
                sizes="(min-width: 1280px) 750px, 90vw"
              />
            </div>
          ) : (
            <CategoryArt category={plan.category} className="h-48 rounded-lg" />
          )}
          <header className="flex flex-col gap-3">
            {/* Favoritar é marcador, e marcador pertence à beirada do que ele
                marca. Empilhado dentro do painel de reações, ele parecia uma
                resposta da mesma pergunta que "Quero muito" — e não é. */}
            <div className="flex items-start justify-between gap-3">
              <span className="type-label text-text-muted mt-2.5">
                {categoryLabel(plan.category)}
              </span>
              <FavoriteButton planId={plan.id} active={meuFavorito} />
            </div>
            <h1
              className={cn(
                "type-display-l break-words",
                plan.status === "cancelled" && "line-through",
              )}
            >
              {plan.title}
            </h1>
            {plan.description ? (
              <p className="type-body text-text-muted break-words whitespace-pre-line">
                {plan.description}
              </p>
            ) : null}
          </header>
          <dl className="border-border-subtle grid grid-cols-1 gap-5 border-y py-5 sm:grid-cols-2">
            {/* O ícone mora dentro do <dt>. A estrutura anterior era
                dl > div > div > dt, e a <dl> só aceita dt/dd como filhos
                diretos ou dentro de um único <div> de agrupamento — o axe
                reprovava com `definition-list` e `dlitem`. */}
            <div>
              <dt className="type-meta text-text-muted flex items-center gap-2">
                <MapPin aria-hidden="true" className="size-5 shrink-0" />
                Onde
              </dt>
              {/* Uma linha so. `city` sobrevive como fallback das linhas
                  gravadas antes de o formulario parar de perguntar (R3). */}
              <dd className="type-body-s mt-1">
                {plan.placeName ?? plan.city ?? "Um lugar para escolher"}
              </dd>
            </div>
            <div>
              <dt className="type-meta text-text-muted flex items-center gap-2">
                <Wallet aria-hidden="true" className="size-5 shrink-0" />
                Orçamento estimado
              </dt>
              <dd className="type-body-s tnum mt-1">
                {plan.estimatedBudgetCents === null
                  ? "Para combinar"
                  : formatCents(plan.estimatedBudgetCents)}
              </dd>
            </div>
            {/* A ideia veio de algum lugar, e esse lugar é parte da ficha.
                Guardado no cadastro e nunca mostrado, o link era um campo que o
                produto pedia e depois perdia. */}
            {plan.sourceUrl ? (
              <div className="sm:col-span-2">
                <dt className="type-meta text-text-muted flex items-center gap-2">
                  <Link2 aria-hidden="true" className="size-5 shrink-0" />
                  De onde veio
                </dt>
                <dd className="type-body-s mt-1 min-w-0">
                  <a
                    href={plan.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex min-h-11 max-w-full items-center gap-1.5 underline underline-offset-4"
                  >
                    <span className="truncate">{linkLabel(plan.sourceUrl)}</span>
                    <ArrowUpRight
                      aria-hidden="true"
                      className="size-4 shrink-0"
                    />
                  </a>
                </dd>
              </div>
            ) : null}
          </dl>
        </article>

        {/* Dizer o que o plano **é** vem antes de completá-lo.

            O R2 mandou este painel para o fim no telefone, com o argumento de
            que administração se faz depois de ler o plano. O uso real desmentiu:
            mover de "Ideia" para "Decidindo" não é administração, é a decisão
            principal — e ela estava a seis seções de distância. Volta para logo
            abaixo da ficha, antes de "Complete a ideia". No desktop nada muda:
            a coluna da direita já era a primeira coisa à vista. */}
        <aside className="flex flex-col gap-5 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="panel flex flex-col gap-6 !p-5">
            <PlanStatusControl
              planId={plan.id}
              status={plan.status}
              facts={facts}
            />
            <div className="border-border-subtle border-t pt-5">
              <ArchivePlanForm
                planId={plan.id}
                archived={plan.archivedAt !== null}
              />
            </div>
          </div>
          <EditorialNote tone="blush" className="hidden lg:flex">
            Boas experiências também aproximam.
          </EditorialNote>
        </aside>

        <div className="flex min-w-0 flex-col gap-10 lg:col-start-1 lg:row-start-2">
          {/* A ordem é a do produto: o que é a ideia, o que vocês acham dela,
              quando ela cabe, com o que ela se parece e, só então, o que
              precisa ser combinado para ela acontecer. Some por inteiro no
              plano realizado — uma gaveta chamada "Editar detalhes" que não
              edita nada é pior que ausência. */}
          {planejamentoCongelado ? null : <CompletePlanPanel plan={plan} />}

          <PlanReactions planId={plan.id} members={reactions} />

          <PlanDates
            planId={plan.id}
            planStatus={plan.status}
            options={dateOptions}
            now={now}
          />

          {/* "Como foi?" vem logo depois da data: no plano realizado, é a
              primeira coisa que as duas pessoas vão procurar (seção 9). */}
          {realizado && ratings ? (
            <PlanReview planId={plan.id} ratings={ratings} />
          ) : null}

          {/* Reserva, checklist e gastos são um bloco só: o que falta combinar
              para o date acontecer. No rail, a reserva ficava separada das
              outras duas por uma coluna inteira. */}
          {plan.requiresBooking ? (
            <PlanReservation
              planId={plan.id}
              reservation={reservation}
              available={reservaDisponivel}
              readOnly={!reservaDisponivel}
            />
          ) : null}
          <PlanChecklist
            planId={plan.id}
            items={checklist}
            now={now}
            readOnly={planejamentoCongelado}
          />
          <PlanExpenses
            planId={plan.id}
            expenses={expenses}
            estimatedBudgetCents={plan.estimatedBudgetCents}
            readOnly={planejamentoCongelado}
          />

          {/* A galeria é o fim do fluxo, e só existe quando há o que guardar.

              Antes do rolê a única imagem é a capa, e ela mora em "Editar
              detalhes" — uma grade vazia durante todo o planejamento seria uma
              pergunta que ainda não tem resposta. A condição inclui `galeria
              .length > 0` para que nenhuma foto já enviada fique invisível num
              plano que ainda não foi marcado como realizado. */}
          {realizado || galeria.length > 0 ? (
            <PlanPhotos
              planId={plan.id}
              planTitle={plan.title}
              photos={galeria}
              allPhotos={photos}
              coverMediaId={plan.coverMediaId}
              showReorder={false}
              title="Galeria"
              uploadPurpose="memory"
              addLabel="Adicionar foto"
              emptyText="Nenhuma foto ainda. Depois do rolê, é aqui que ficam as que vocês tiraram."
              readOnly={somenteLeitura}
              canAdd={realizado}
            />
          ) : null}

          <ActivityFeed
            planId={plan.id}
            activity={activity}
            currentProfileId={ctx.profileId}
            now={now}
          />
        </div>
      </div>
    </div>
  );
}
