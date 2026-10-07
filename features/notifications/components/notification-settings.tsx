"use client";

import { BellRing } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  savePreferencesAction,
  sendTestPushAction,
  subscribeToPushAction,
  unsubscribeFromPushAction,
} from "@/features/notifications/actions/notification-actions";
import {
  applicationServerKeyBytes,
  isSubscribedWithOtherKey,
} from "@/features/notifications/application-server-key";
import type { NotificationPreferences } from "@/features/notifications/data/subscriptions";
import type { TestPushState } from "@/features/notifications/send/test-push";

/**
 * A seção de notificações do Perfil (seção 16 do docs/NOTIFICATIONS.md).
 *
 * Duas regras de produto moram aqui:
 *
 * 1. **Nunca pedir permissão ao carregar.** O prompt do sistema só aparece
 *    depois de um clique explícito. Pedir na abertura é como o usuário perde a
 *    chance para sempre: um "bloquear" acidental não tem desfazer dentro do app.
 * 2. **Detecção por capacidade, não por navegador.** Nada de olhar `userAgent`
 *    nem versão do iOS. Se `PushManager` não existe, a orientação aparece; se
 *    existir, o caminho é o mesmo em todo lugar.
 */

type Estado =
  | "carregando"
  | "sem-suporte"
  | "precisa-instalar"
  | "disponivel"
  | "bloqueado"
  | "ativo";

/**
 * Uma única transição de estado, resolvida fora do componente.
 *
 * A versão anterior chamava `setEstado` em cada ramo da detecção, dentro do
 * efeito e antes de qualquer `await` — o que dispara renderizações em cascata e
 * é justamente o que o lint do Next barra. Concentrar tudo aqui também deixa a
 * ordem das perguntas legível: suporte, instalação, permissão, inscrição.
 */
async function detectarEstado(): Promise<Estado> {
  if (typeof window === "undefined") return "carregando";

  if (!("serviceWorker" in navigator) || !("Notification" in window)) {
    return "sem-suporte";
  }

  /* Service Worker sem PushManager é a assinatura do iOS fora da Tela de
     Início: lá o Push só existe na web app instalada. A conclusão vem da
     capacidade ausente, não de ter lido "iPhone" no userAgent. */
  if (!("PushManager" in window)) return "precisa-instalar";

  if (Notification.permission === "denied") return "bloqueado";

  const registro = await navigator.serviceWorker.ready;
  const atual = await registro.pushManager.getSubscription();
  return atual ? "ativo" : "disponivel";
}

/**
 * Tira uma subscription de cena, no servidor e no navegador.
 *
 * Ordem: servidor primeiro. Se o navegador cancelasse antes e a action
 * falhasse, o endpoint continuaria ativo no banco sem nenhum navegador do outro
 * lado — e viraria entrega falhando para sempre.
 */
async function descartar(subscription: PushSubscription): Promise<void> {
  await unsubscribeFromPushAction(subscription.endpoint);
  await subscription.unsubscribe();
}

type Conferencia = { estado: Estado; erro?: string };

/**
 * Confere com o servidor o aparelho que o navegador diz estar inscrito.
 *
 * "Ativo" nesta tela é uma pergunta feita ao navegador, e há duas coisas que
 * ele não sabe responder:
 *
 * 1. **O servidor gravou?** Foi assim que o DATE passou dias dizendo "este
 *    aparelho está recebendo notificações" com `push_subscriptions` vazia em
 *    produção (D-180). O upsert é idempotente, então reenviar a cada visita
 *    custa uma escrita e fecha a distância.
 * 2. **A inscrição é da chave que o servidor usa hoje?** Uma subscription feita
 *    antes de uma troca de chave VAPID continua "ativa" para sempre no
 *    navegador, e o push service recusa todo envio para ela (D-181). Reenviá-la
 *    só gravaria no banco um endpoint condenado. Ela é trocada por uma nova,
 *    com a chave atual; a permissão já foi dada, então não há prompt.
 */
async function conferirInscricao(vapidPublicKey: string): Promise<Conferencia> {
  const registro = await navigator.serviceWorker.ready;
  const atual = await registro.pushManager.getSubscription();
  if (!atual) return { estado: "disponivel" };

  if (vapidPublicKey) {
    const chave = applicationServerKeyBytes(vapidPublicKey);

    if (isSubscribedWithOtherKey(atual, chave)) {
      await descartar(atual);

      try {
        const nova = await registro.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: chave,
        });
        const resposta = await subscribeToPushAction(nova.toJSON());
        return { estado: "ativo", erro: resposta.error };
      } catch {
        /* Há navegador que só inscreve dentro de um toque. O botão de ativar é
           esse toque, e a velha já saiu — então ele funciona de primeira. */
        return {
          estado: "disponivel",
          erro: "Este aparelho precisa ativar as notificações de novo.",
        };
      }
    }
  }

  const resposta = await subscribeToPushAction(atual.toJSON());
  return { estado: "ativo", erro: resposta.error };
}

/** O que dizer quando o teste não chegou ao aparelho. */
function mensagemDoTeste(
  resposta: Extract<TestPushState, { ok: false }>,
): string {
  const codigo = resposta.codigo ? ` (${resposta.codigo})` : "";

  switch (resposta.motivo) {
    case "sem-registro":
      return "O servidor não reconheceu este aparelho. Desative e ative de novo.";
    case "expirada":
      return "A inscrição deste aparelho tinha expirado. Ative de novo.";
    case "servidor":
      return (
        `As chaves de notificação do servidor estão mal configuradas${codigo}. ` +
        "Isso se corrige nas variáveis de ambiente do deploy, não no aparelho."
      );
    case "recusada":
      return (
        `O serviço de notificações recusou o envio${codigo}. ` +
        "Desative e ative de novo neste aparelho."
      );
    case "indisponivel":
      return `O serviço de notificações não respondeu agora${codigo}. Tente de novo em instantes.`;
  }
}

export function NotificationSettings({
  initialPreferences,
  vapidPublicKey,
}: {
  initialPreferences: NotificationPreferences;
  vapidPublicKey: string;
}) {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [dispensado, setDispensado] = useState(false);
  const [testando, setTestando] = useState(false);
  const [prefs, setPrefs] = useState(initialPreferences);
  const [pendente, startTransition] = useTransition();

  useEffect(() => {
    void detectarEstado().then((inicial) => {
      setEstado(inicial);
      /* Só na abertura, não a cada volta à aba: a volta responde a uma
         mudança de permissão lá fora, e a subscription não muda com ela. */
      if (inicial === "ativo") {
        void conferirInscricao(vapidPublicKey)
          .then((conferida) => {
            setEstado(conferida.estado);
            if (conferida.erro) setErro(conferida.erro);
          })
          .catch(() => {
            setErro("Não foi possível confirmar este aparelho com o servidor.");
          });
      }
    });

    /* Sair do DATE, liberar a permissão nas configurações do navegador e voltar
       não emite evento nenhum que o React veja: a tela continuaria dizendo
       "bloqueado" até um recarregamento manual. O retorno à aba é o gatilho mais
       próximo que existe de "a pessoa acabou de mexer nisso lá fora". */
    function aoVoltar() {
      if (document.visibilityState === "visible") {
        void detectarEstado().then(setEstado);
      }
    }

    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, [vapidPublicKey]);

  async function ativar() {
    setErro(null);
    setAviso(null);
    setDispensado(false);

    if (!vapidPublicKey) {
      setErro("As notificações ainda não estão configuradas neste ambiente.");
      return;
    }

    /* O clique é o gesto que autoriza o prompt. Chamar isto fora de um handler
       faz navegadores recusarem em silêncio. */
    const permissao = await Notification.requestPermission();
    if (permissao !== "granted") {
      /* Três desfechos, não dois. `denied` é decisão registrada e o navegador
         não deixa perguntar de novo; `default` é o prompt fechado sem escolher,
         e aí perguntar de novo continua valendo. Tratar os dois como o mesmo
         caso era o que fazia a opção sumir sem explicação. */
      setEstado(permissao === "denied" ? "bloqueado" : "disponivel");
      setDispensado(permissao !== "denied");
      return;
    }

    /* `subscribe` rejeita quando o push service do navegador recusa ou está
       fora do ar. Sem o `catch`, a promise morria sem ninguém ver e o botão
       simplesmente não fazia nada. */
    try {
      const registro = await navigator.serviceWorker.ready;
      const chave = applicationServerKeyBytes(vapidPublicKey);

      /* Uma inscrição antiga com outra chave faz o `subscribe` rejeitar com
         InvalidStateError — e com a mesma chave ele só a devolve. Então a velha
         sai antes, e só quando a chave dela é outra. */
      const antiga = await registro.pushManager.getSubscription();
      if (antiga && isSubscribedWithOtherKey(antiga, chave)) {
        await descartar(antiga);
      }

      const subscription = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chave,
      });

      const resposta = await subscribeToPushAction(subscription.toJSON());
      if (resposta.error) {
        setErro(resposta.error);
        return;
      }
    } catch {
      setErro("Não foi possível ativar neste aparelho. Tente de novo.");
      return;
    }

    setEstado("ativo");
  }

  /**
   * O teste de ponta a ponta (D-181): servidor, chave, push service, Service
   * Worker e sistema, na hora, com a resposta voltando para esta tela.
   */
  async function testar() {
    setErro(null);
    setAviso(null);
    setTestando(true);

    try {
      const registro = await navigator.serviceWorker.ready;
      const atual = await registro.pushManager.getSubscription();
      if (!atual) {
        setEstado("disponivel");
        return;
      }

      let resposta = await sendTestPushAction(atual.endpoint);

      /* O servidor não conhecia este aparelho — o defeito do D-180. Registra e
         tenta mais uma vez, em vez de mandar a pessoa adivinhar o que fazer. */
      if (!resposta.ok && resposta.motivo === "sem-registro") {
        const gravou = await subscribeToPushAction(atual.toJSON());
        if (gravou.error) {
          setErro(gravou.error);
          return;
        }
        resposta = await sendTestPushAction(atual.endpoint);
      }

      if (resposta.ok) {
        /* Daqui em diante o push service aceitou: se nada aparecer, o bloqueio
           é do sistema, e é isso que a frase precisa dizer. */
        setAviso(
          "Enviada. Ela aparece em alguns segundos — se não aparecer, as " +
            "notificações do DATE estão desligadas nos ajustes do aparelho.",
        );
        return;
      }

      if (resposta.motivo === "expirada") {
        await atual.unsubscribe();
        setEstado("disponivel");
      }

      setErro(mensagemDoTeste(resposta));
    } catch {
      setErro("Não foi possível enviar o teste agora. Tente de novo.");
    } finally {
      setTestando(false);
    }
  }

  async function desativar() {
    setErro(null);
    setAviso(null);
    const registro = await navigator.serviceWorker.ready;
    const subscription = await registro.pushManager.getSubscription();
    if (subscription) await descartar(subscription);

    setEstado("disponivel");
  }

  function alternar(campo: keyof NotificationPreferences, valor: unknown) {
    const proximo = { ...prefs, [campo]: valor } as NotificationPreferences;
    setPrefs(proximo);
    startTransition(async () => {
      const resposta = await savePreferencesAction({ [campo]: valor });
      if (resposta.error) {
        setErro(resposta.error);
        setPrefs(prefs);
      }
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="section-heading flex items-center gap-3">
        <BellRing aria-hidden="true" className="size-5" />
        Notificações
      </h2>

      {estado === "carregando" ? (
        <p className="type-body-s text-text-muted">
          Verificando este aparelho…
        </p>
      ) : null}

      {estado === "sem-suporte" ? (
        <p className="type-body-s text-text-muted">
          Este navegador não envia notificações. O DATE funciona igual sem elas.
        </p>
      ) : null}

      {estado === "precisa-instalar" ? (
        <p className="type-body-s text-text-muted">
          No iPhone, as notificações só funcionam com o DATE instalado. Toque em{" "}
          <strong className="text-text">Compartilhar</strong>, depois em{" "}
          <strong className="text-text">Adicionar à Tela de Início</strong>,
          abra pelo ícone e volte aqui.
        </p>
      ) : null}

      {/* Bloqueado não é definitivo: é uma permissão guardada pelo navegador,
          e a pessoa pode tirá-la de lá quando quiser. O que o DATE não pode é
          perguntar de novo sozinho — então a tela ensina o caminho e oferece um
          botão para reconferir na volta, em vez de só informar a derrota. */}
      {estado === "bloqueado" ? (
        <>
          <p className="type-body-s text-text-muted">
            As notificações estão bloqueadas para este site nas configurações do
            navegador. O DATE não consegue pedir de novo — mas você pode liberar
            por lá e voltar aqui.
          </p>
          <p className="type-body-s text-text-muted">
            No Chrome, toque no{" "}
            <strong className="text-text">ícone à esquerda do endereço</strong>{" "}
            → Permissões → Notificações. No iPhone, em Ajustes → DATE →
            Notificações.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-fit"
            onClick={() => {
              setErro(null);
              void detectarEstado().then(setEstado);
            }}
          >
            Verificar de novo
          </Button>
        </>
      ) : null}

      {estado === "disponivel" ? (
        <>
          <p className="type-body-s text-text-muted">
            Avisos do que a outra pessoa fez e lembretes dos dates marcados.
            Nada de propaganda.
          </p>
          {dispensado ? (
            <p className="type-body-s text-text-muted">
              Você fechou o aviso sem escolher. Pode ativar quando quiser — o
              botão continua aqui.
            </p>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-fit"
            onClick={ativar}
          >
            Ativar notificações
          </Button>
        </>
      ) : null}

      {estado === "ativo" ? (
        <>
          <p className="type-body-s text-text-muted">
            Este aparelho está recebendo notificações.
          </p>

          <fieldset className="flex flex-col gap-1">
            <legend className="sr-only">O que chega</legend>

            <label className="flex min-h-11 items-center gap-3">
              <input
                className="check-control"
                type="checkbox"
                checked={prefs.activityEnabled}
                disabled={pendente}
                onChange={(event) =>
                  alternar("activityEnabled", event.target.checked)
                }
              />
              <span className="type-body-s">Atividades do casal</span>
            </label>

            <label className="flex min-h-11 items-center gap-3">
              <input
                className="check-control"
                type="checkbox"
                checked={prefs.dateRemindersEnabled}
                disabled={pendente}
                onChange={(event) =>
                  alternar("dateRemindersEnabled", event.target.checked)
                }
              />
              <span className="type-body-s">Lembretes de dates</span>
            </label>

            <label className="flex min-h-11 items-center gap-3">
              <input
                className="check-control"
                type="checkbox"
                checked={prefs.previewMode === "full"}
                disabled={pendente}
                onChange={(event) =>
                  alternar(
                    "previewMode",
                    event.target.checked ? "full" : "private",
                  )
                }
              />
              <span className="type-body-s">
                Mostrar detalhes na tela bloqueada
              </span>
            </label>
          </fieldset>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={testar}
              loading={testando}
              loadingLabel="Enviando…"
            >
              Enviar notificação de teste
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={desativar}>
              Desativar neste aparelho
            </Button>
          </div>
        </>
      ) : null}

      {aviso ? (
        <p role="status" className="type-body-s text-text-muted">
          {aviso}
        </p>
      ) : null}

      {erro ? (
        <p role="alert" className="type-body-s text-danger">
          {erro}
        </p>
      ) : null}
    </section>
  );
}
