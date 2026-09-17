"use client";

import { BellRing } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  savePreferencesAction,
  subscribeToPushAction,
  unsubscribeFromPushAction,
} from "@/features/notifications/actions/notification-actions";
import type { NotificationPreferences } from "@/features/notifications/data/subscriptions";

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
 * Base64 URL-safe → `ArrayBuffer`, que é o que `applicationServerKey` aceita.
 *
 * Devolve o buffer, e não a view: o tipo do DOM pede `BufferSource` com
 * `ArrayBuffer` concreto, e um `Uint8Array` genérico não satisfaz por causa da
 * possibilidade de `SharedArrayBuffer`.
 */
function chaveParaBytes(base64: string): ArrayBuffer {
  const preenchido = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  );
  const normal = preenchido.replace(/-/g, "+").replace(/_/g, "/");
  const bruto = window.atob(normal);
  const buffer = new ArrayBuffer(bruto.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bruto.length; i += 1) {
    bytes[i] = bruto.charCodeAt(i);
  }
  return buffer;
}

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

export function NotificationSettings({
  initialPreferences,
  vapidPublicKey,
}: {
  initialPreferences: NotificationPreferences;
  vapidPublicKey: string;
}) {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [erro, setErro] = useState<string | null>(null);
  const [dispensado, setDispensado] = useState(false);
  const [prefs, setPrefs] = useState(initialPreferences);
  const [pendente, startTransition] = useTransition();

  useEffect(() => {
    void detectarEstado().then(setEstado);

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
  }, []);

  async function ativar() {
    setErro(null);
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

    const registro = await navigator.serviceWorker.ready;
    const subscription = await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: chaveParaBytes(vapidPublicKey),
    });

    const resposta = await subscribeToPushAction(subscription.toJSON());
    if (resposta.error) {
      setErro(resposta.error);
      return;
    }

    setEstado("ativo");
  }

  async function desativar() {
    setErro(null);
    const registro = await navigator.serviceWorker.ready;
    const subscription = await registro.pushManager.getSubscription();

    if (subscription) {
      /* Ordem: servidor primeiro. Se o navegador cancelasse antes e a action
         falhasse, o endpoint continuaria ativo no banco sem nenhum navegador do
         outro lado — e viraria entrega falhando para sempre. */
      await unsubscribeFromPushAction(subscription.endpoint);
      await subscription.unsubscribe();
    }

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

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={desativar}
            className="w-fit"
          >
            Desativar neste aparelho
          </Button>
        </>
      ) : null}

      {erro ? (
        <p role="alert" className="type-body-s text-danger">
          {erro}
        </p>
      ) : null}
    </section>
  );
}
