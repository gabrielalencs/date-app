"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  confirmUploadAction,
  startUploadAction,
} from "@/features/media/actions/media-actions";
import { TrimRange } from "@/features/media/components/trim-range";
import { MAX_VIDEO_SECONDS } from "@/features/media/constants";
import { putWithProgress } from "@/features/media/put-with-progress";
import {
  uploadVideo,
  type VideoUploadPorts,
  type VideoUploadStage,
} from "@/features/media/upload-flow";
import { browserVideoRuntime } from "@/features/media/video/browser-video-runtime";
import {
  VideoProcessingCanceled,
  VideoProcessingError,
  inspectVideoFile,
  type ProcessedVideo,
  type VideoProbe,
} from "@/features/media/video/process-video";
import {
  formatClock,
  initialWindow,
  type TrimWindow,
} from "@/features/media/video/trim-window";

/**
 * Escolher o trecho de um vídeo e enviá-lo (D-184).
 *
 * Gaveta, e não modal: no telefone ela sobe de baixo e deixa a prévia em cima
 * das alças, que é a ordem em que se usa — ver, ajustar, enviar.
 *
 * Os vídeos que chegam aqui quase sempre passam do minuto. Por isso o trecho
 * nasce no teto — do começo até 1:00 — e a pessoa só arrasta para onde quer;
 * quando o vídeo inteiro cabe, ele nasce inteiro e a gaveta diz isso.
 *
 * Três etapas com nome e número (D-019, sem spinner): preparar o vídeo no
 * aparelho, enviar, salvar. A primeira leva de segundos a um minuto no
 * celular; sem porcentagem, parece travamento.
 */
const PORTS: VideoUploadPorts = {
  runtime: browserVideoRuntime,
  start: startUploadAction,
  confirm: confirmUploadAction,
  put: putWithProgress,
};

type Estado =
  | { fase: "abrindo" }
  | { fase: "pronto" }
  | { fase: "trabalhando"; etapa: VideoUploadStage }
  | { fase: "falhou"; mensagem: string; podeTentarDeNovo: boolean };

const ROTULO: Record<VideoUploadStage["stage"], string> = {
  convertendo: "Preparando o vídeo",
  enviando: "Enviando",
  salvando: "Salvando",
};

function fracaoDe(etapa: VideoUploadStage): number {
  return etapa.stage === "salvando" ? 1 : etapa.fraction;
}

/**
 * Converter um minuto de vídeo leva tempo, e o Android apaga a tela e congela
 * a aba nesse meio-tempo. Pedir a tela acesa durante o trabalho é o que deixa
 * a pessoa largar o celular na mesa. Sem suporte, segue sem.
 */
async function manterTelaAcesa(): Promise<() => void> {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
    return () => {};
  }

  try {
    const trava = await navigator.wakeLock.request("screen");
    return () => void trava.release().catch(() => {});
  } catch {
    return () => {};
  }
}

export function VideoTrimSheet({
  file,
  planId,
  onClose,
  onUploaded,
}: {
  file: File;
  planId: string;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [probe, setProbe] = useState<VideoProbe | null>(null);
  const [trecho, setTrecho] = useState<TrimWindow>({ start: 0, end: 0 });
  const [estado, setEstado] = useState<Estado>({ fase: "abrindo" });
  const [tocando, setTocando] = useState(false);
  const [previaFalhou, setPreviaFalhou] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const controleRef = useRef<AbortController | null>(null);
  /** Última etapa e porcentagem mostradas, para só repintar quando mudam. */
  const ultimaEtapa = useRef("");
  /**
   * O vídeo já convertido, de qual trecho, e — se os dois arquivos já
   * subiram — com qual `uploadId`. Se o envio falhar depois da conversão, o
   * "Tentar de novo" sobe este em vez de converter outra vez; se só a
   * confirmação falhou, ele só confirma. Mexer numa alça descarta tudo: é
   * outro trecho, outro vídeo.
   */
  const convertido = useRef<{
    trecho: TrimWindow;
    video: ProcessedVideo;
    enviado: string | null;
  } | null>(null);

  const trabalhando = estado.fase === "trabalhando";
  /* "Salvando" é a confirmação no servidor, uma action que não se cancela:
     fechar a gaveta agora diria à pessoa que o vídeo não subiu, e ele sobe
     mesmo assim. Dura menos de um segundo; durante ele, a gaveta não fecha. */
  const salvando = trabalhando && estado.etapa.stage === "salvando";

  /* A prévia toca o arquivo que ainda está no aparelho, por `blob:`.

     Ref de callback, e não efeito: o `<video>` mora no portal da gaveta, que o
     Radix só monta depois do primeiro commit — um `useEffect` aqui rodaria
     antes e encontraria o ref vazio. O callback roda quando o elemento existe
     de fato, e a limpeza que ele devolve solta a URL quando ele sai. */
  const conectarPrevia = useCallback(
    (video: HTMLVideoElement | null) => {
      if (!video) return;

      videoRef.current = video;
      const url = URL.createObjectURL(file);
      video.src = url;

      return () => {
        video.pause();
        video.removeAttribute("src");
        video.load();
        URL.revokeObjectURL(url);
        if (videoRef.current === video) videoRef.current = null;
      };
    },
    [file],
  );

  /* Abrir antes de mostrar as alças: um vídeo que este navegador não lê é
     recusado aqui, antes de a pessoa gastar tempo escolhendo o trecho. */
  useEffect(() => {
    let vivo = true;

    inspectVideoFile(file, browserVideoRuntime)
      .then((aberto) => {
        if (!vivo) return;
        setProbe(aberto);
        setTrecho(initialWindow(aberto.durationSeconds));
        setEstado({ fase: "pronto" });
      })
      .catch((error: unknown) => {
        if (!vivo) return;
        setEstado({
          fase: "falhou",
          mensagem:
            error instanceof VideoProcessingError
              ? error.message
              : "Não foi possível abrir esse vídeo. Tente outro.",
          podeTentarDeNovo: false,
        });
      });

    return () => {
      vivo = false;
    };
  }, [file]);

  // Sair da página no meio do envio cancela o trabalho, não o deixa órfão.
  useEffect(() => () => controleRef.current?.abort(), []);

  function fechar() {
    if (salvando) return;
    controleRef.current?.abort();
    onClose();
  }

  function mover(proximo: TrimWindow, alca: "start" | "end") {
    setTrecho(proximo);
    convertido.current = null;

    const video = videoRef.current;
    if (video && !previaFalhou) {
      video.pause();
      // A prévia pula para a alça que mexeu: é o quadro do corte.
      video.currentTime = alca === "start" ? proximo.start : proximo.end;
    }
  }

  function alternarPrevia() {
    const video = videoRef.current;
    if (!video) return;

    if (!video.paused) {
      video.pause();
      return;
    }

    if (
      video.currentTime < trecho.start ||
      video.currentTime >= trecho.end - 0.05
    ) {
      video.currentTime = trecho.start;
    }
    void video.play().catch((error: unknown) => {
      /* Só "não suportado" é prévia quebrada. Tocar e logo arrastar uma alça
         chama `pause()` com o `play()` ainda pendente, e ele rejeita com
         `AbortError` — que é a pessoa mexendo, não o navegador falhando. */
      if (error instanceof DOMException && error.name === "NotSupportedError") {
        setPreviaFalhou(true);
      }
    });
  }

  /* A prévia toca só o trecho: chegou no fim, volta para o começo e para. */
  function limitarAoTrecho() {
    const video = videoRef.current;
    if (video && !video.paused && video.currentTime >= trecho.end) {
      video.pause();
      video.currentTime = trecho.start;
    }
  }

  async function enviar() {
    if (!probe) return;

    const controle = new AbortController();
    controleRef.current = controle;
    ultimaEtapa.current = "";
    videoRef.current?.pause();

    /* O mesmo trecho já convertido numa tentativa que falhou no envio. A
       comparação é por valor: o trecho só muda pelas alças, e mexer nelas já
       descarta o convertido — esta é a segunda trava, não a primeira. */
    const reaproveitar =
      convertido.current &&
      convertido.current.trecho.start === trecho.start &&
      convertido.current.trecho.end === trecho.end
        ? convertido.current
        : null;

    setEstado({
      fase: "trabalhando",
      etapa: !reaproveitar
        ? { stage: "convertendo", fraction: 0 }
        : reaproveitar.enviado
          ? { stage: "salvando" }
          : { stage: "enviando", fraction: 0 },
    });

    const soltarTela = await manterTelaAcesa();

    try {
      const resultado = await uploadVideo(PORTS, {
        file,
        planId,
        probe,
        window: trecho,
        signal: controle.signal,
        reuse: reaproveitar?.video,
        sentUploadId: reaproveitar?.enviado ?? undefined,
        onProcessed: (video) => {
          convertido.current = { trecho, video, enviado: null };
        },
        onSent: (uploadId) => {
          if (convertido.current) convertido.current.enviado = uploadId;
        },
        onStage: (etapa) => {
          /* A conversão avisa a cada quadro. Repintar a gaveta trinta vezes
             por segundo para o número mudar uma vez é trabalho tirado do
             celular, que está ocupado convertendo. */
          const chave = `${etapa.stage}:${Math.round(fracaoDe(etapa) * 100)}`;
          if (chave === ultimaEtapa.current) return;
          ultimaEtapa.current = chave;
          setEstado({ fase: "trabalhando", etapa });
        },
      });

      if (resultado.ok) {
        onUploaded();
        return;
      }

      setEstado({
        fase: "falhou",
        mensagem: resultado.error,
        podeTentarDeNovo: true,
      });
    } catch (error) {
      // Quem cancelou foi a pessoa, fechando a gaveta. Não há o que dizer.
      if (error instanceof VideoProcessingCanceled || controle.signal.aborted) {
        return;
      }

      setEstado({
        fase: "falhou",
        mensagem: "Algo deu errado no envio do vídeo. Tente de novo.",
        podeTentarDeNovo: true,
      });
    } finally {
      soltarTela();
      if (controleRef.current === controle) controleRef.current = null;
    }
  }

  const cabeInteiro =
    probe !== null && probe.durationSeconds <= MAX_VIDEO_SECONDS;

  return (
    <Sheet
      open
      onOpenChange={(aberto) => {
        if (!aberto) fechar();
      }}
    >
      <SheetContent
        title="Escolha o trecho"
        description={`Até ${MAX_VIDEO_SECONDS / 60} minuto. Arraste as alças para marcar o começo e o fim.`}
        dismissOnOutside={!trabalhando}
      >
        <div className="flex flex-col gap-5">
          <div className="bg-video-backdrop relative grid min-h-40 place-items-center overflow-hidden rounded-md">
            <video
              ref={conectarPrevia}
              playsInline
              preload="auto"
              aria-label="Prévia do vídeo escolhido"
              /* 30% da altura: num telefone de 320×720 a gaveta inteira —
                 prévia, alças e os dois botões — cabe sem rolar. Com 38% os
                 botões ficavam abaixo da dobra da gaveta (medido na captura). */
              className="block max-h-[30dvh] w-full object-contain"
              onPlay={() => setTocando(true)}
              onPause={() => setTocando(false)}
              onTimeUpdate={limitarAoTrecho}
              onError={() => setPreviaFalhou(true)}
            />
            {previaFalhou ? (
              <p className="type-body-s text-on-photo absolute inset-x-4 text-center">
                A prévia não abriu neste navegador, mas o trecho marcado nas
                alças é o que vai subir.
              </p>
            ) : null}
          </div>

          {estado.fase === "abrindo" ? (
            <p className="type-body-s text-text-muted">Abrindo o vídeo…</p>
          ) : null}

          {probe ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <IconButton
                  variant="solid"
                  /* Sem isto, o texto ao lado espreme o botão abaixo dos 44px
                     em 320px — medido, não suposto. */
                  className="shrink-0"
                  label={tocando ? "Pausar a prévia" : "Tocar o trecho"}
                  icon={
                    tocando ? (
                      <Pause className="size-4" fill="currentColor" />
                    ) : (
                      <Play className="size-4" fill="currentColor" />
                    )
                  }
                  disabled={trabalhando || previaFalhou}
                  onClick={alternarPrevia}
                />
                <p className="type-body-s text-text-muted">
                  {cabeInteiro
                    ? `O vídeo tem ${formatClock(probe.durationSeconds)} e cabe inteiro.`
                    : `O vídeo tem ${formatClock(probe.durationSeconds)}. Escolha até ${formatClock(MAX_VIDEO_SECONDS)}.`}
                </p>
              </div>

              <TrimRange
                duration={probe.durationSeconds}
                value={trecho}
                onChange={mover}
                disabled={trabalhando}
              />
            </div>
          ) : null}

          {estado.fase === "trabalhando" ? (
            <Progress
              value={fracaoDe(estado.etapa)}
              label={ROTULO[estado.etapa.stage]}
            />
          ) : null}

          {estado.fase === "falhou" ? (
            <p role="alert" className="type-body-s text-danger">
              {estado.mensagem}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={salvando}
              onClick={fechar}
            >
              {trabalhando
                ? "Cancelar envio"
                : estado.fase === "falhou" && !estado.podeTentarDeNovo
                  ? "Fechar"
                  : "Cancelar"}
            </Button>

            {estado.fase === "falhou" && !estado.podeTentarDeNovo ? null : (
              <Button
                type="button"
                variant="primary"
                /* `trabalhando` explícito: o Button só desabilita sozinho
                   quando `disabled` não é passado, e o `loading` sozinho só
                   tira o ponteiro — Enter ou espaço no botão ainda focado
                   disparariam um segundo envio em paralelo ao primeiro. */
                disabled={!probe || trabalhando}
                loading={trabalhando}
                loadingLabel={
                  trabalhando ? ROTULO[estado.etapa.stage] : undefined
                }
                onClick={() => void enviar()}
              >
                {estado.fase === "falhou" ? "Tentar de novo" : "Enviar trecho"}
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
