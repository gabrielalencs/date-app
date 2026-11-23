"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  confirmUploadAction,
  startUploadAction,
} from "@/features/media/actions/media-actions";
import { VideoTrimSheet } from "@/features/media/components/video-trim-sheet";
import {
  acceptsVideo,
  type UploadablePurpose,
} from "@/features/media/constants";
import { browserImageRuntime } from "@/features/media/image/browser-runtime";
import { manterTelaAcesa } from "@/features/media/keep-screen-on";
import { putWithProgress } from "@/features/media/put-with-progress";
import {
  UNEXPECTED_UPLOAD_ERROR,
  uploadPhotos,
  type PhotoBatchFailure,
  type PhotoBatchProgress,
  type PhotoUploadStage,
  type UploadPorts,
} from "@/features/media/upload-flow";
import { summarizeFailures } from "@/features/media/upload-summary";
import { isVideoFile } from "@/features/media/video/detect";

/**
 * Escolher e enviar fotos — ou, na Galeria, também vídeos (D-184). Toda a
 * redução acontece aqui, no aparelho, antes de qualquer byte sair — o EXIF é
 * descartado no reencode (D-051).
 *
 * Fora da capa, a escolha aceita vários arquivos de uma vez. As fotos sobem
 * em fila, uma por vez (`uploadPhotos`), e cada uma aparece na grade assim que
 * é confirmada. A capa continua sendo uma foto só: ela é uma, e escolher cinco
 * para quatro serem descartadas seria pedir uma decisão que a tela não sabe
 * tomar.
 *
 * Sem spinner (D-019): a espera aparece como rótulo trocado e botão
 * desabilitado. As três etapas têm nome, porque reduzir uma foto de 8 MB no
 * celular leva alguns segundos e silêncio nesse intervalo parece travamento.
 * Num lote, o rótulo também diz qual foto é a da vez.
 *
 * Vídeo não sobe direto: ele abre a gaveta de corte, porque quase todo vídeo
 * passa do minuto e a pessoa precisa dizer qual trecho quer. Vários vídeos na
 * mesma escolha viram uma fila de gavetas, uma por vídeo, depois das fotos.
 */
/* O PUT assinado é um só para foto e vídeo (`put-with-progress.ts`): os
   cabeçalhos que a assinatura prende e o tratamento de status não podem ter
   duas versões. A foto não usa o progresso — ela sobe em um segundo. */
const PORTS: UploadPorts = {
  runtime: browserImageRuntime,
  start: startUploadAction,
  confirm: confirmUploadAction,
  put: putWithProgress,
};

const ROTULO: Record<PhotoUploadStage, string> = {
  preparando: "Preparando a imagem",
  enviando: "Enviando",
  salvando: "Salvando",
};

/* Com o contador ao lado, "a imagem" sobra — e o botão fica largo demais no
   telefone de 320px. */
const ROTULO_NO_LOTE: Record<PhotoUploadStage, string> = {
  preparando: "Preparando",
  enviando: "Enviando",
  salvando: "Salvando",
};

function rotulo({ current, total, stage }: PhotoBatchProgress): string {
  return total === 1
    ? ROTULO[stage]
    : `${ROTULO_NO_LOTE[stage]} ${current} de ${total}`;
}

/* `image/*` sozinho manda o seletor do Android esconder arquivo cujo tipo o
   sistema não resolveu — e é justamente o que acontece com imagem que veio de
   outro app, de cartão de memória ou de pasta não indexada. As extensões
   entram ao lado para esses reaparecerem na lista. Quem decide se abre
   continua sendo o decodificador. */
const ACEITA_FOTO = "image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.heic,.heif,.avif";

/* O mesmo cuidado para vídeo: extensões ao lado de `video/*`. */
const ACEITA_VIDEO = "video/*,.mp4,.m4v,.mov,.3gp,.webm,.mkv";

const CAPA_E_FOTO =
  "A capa precisa ser uma foto. Vídeos entram pela Galeria, depois do rolê.";

const NAO_LEU =
  "Não foi possível ler esse arquivo. Se ele está na nuvem, espere terminar " +
  "de baixar no celular e tente de novo.";

/**
 * Um lote por aba, mesmo entre telas.
 *
 * Sair da página no meio do envio não para o lote: as fotos que faltam
 * continuam subindo, como a foto única sempre continuou. Quem volta encontra
 * um seletor montado do zero — e, sem esta corrente, um segundo lote
 * escolhido ali decodificaria ao mesmo tempo que o primeiro, que é justamente
 * o que a fila existe para evitar. O lote novo espera o anterior terminar.
 */
let loteAnterior: Promise<unknown> = Promise.resolve();

function depoisDoLoteAnterior<T>(trabalho: () => Promise<T>): Promise<T> {
  const minhaVez = loteAnterior.then(trabalho);
  loteAnterior = minhaVez.catch(() => {});
  return minhaVez;
}

/**
 * A gaveta seguinte da fila nasce no mesmo lugar da anterior, com "Cancelar"
 * no mesmo ponto da tela. Fechá-la antes deste intervalo é o segundo toque de
 * um toque duplo, não uma decisão sobre um vídeo que nem deu para ver.
 */
const GAVETA_RECEM_ABERTA_MS = 500;

/**
 * Um arquivo só: a frase do motivo, como sempre foi. Vários: o resumo do
 * lote, com os nomes.
 */
type Aviso =
  | { tipo: "frase"; texto: string }
  | { tipo: "lote"; escolhidos: number; falhas: readonly PhotoBatchFailure[] };

/** Os vídeos que ainda vão abrir a gaveta de corte, e quantos eram. */
type Fila = { videos: readonly File[]; total: number };

export function PhotoPicker({
  planId,
  purpose,
  label,
  variant = "secondary",
}: {
  planId: string;
  purpose: UploadablePurpose;
  label: string;
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  /**
   * Quantos arquivos estão sendo lidos antes do envio começar; zero é parado.
   * Descobrir se cada um é vídeo e pedir a tela acesa leva um instante — mais,
   * se algum arquivo ainda está na nuvem —, e sem trava nesse intervalo um
   * segundo toque abriria o seletor de novo e começaria um lote em paralelo.
   */
  const [lendo, setLendo] = useState(0);
  const [andamento, setAndamento] = useState<PhotoBatchProgress | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [fila, setFila] = useState<Fila | null>(null);
  /** Quando a fila de vídeos andou pela última vez — ver `fecharVideo`. */
  const filaAndouEm = useRef(0);

  const ocupado = lendo > 0 || andamento !== null;
  const aceitaVideo = acceptsVideo(purpose);
  const varios = purpose !== "cover";
  const videoDaVez = fila?.videos[0];
  /** Posição do vídeo da vez na fila, a partir de zero. */
  const posicaoDaVez = fila ? fila.total - fila.videos.length : 0;

  function liberarInput() {
    if (inputRef.current) {
      // Sem isto, escolher o mesmo arquivo de novo não dispara change.
      inputRef.current.value = "";
    }
  }

  /**
   * Avança só se a gaveta que pediu ainda é a da vez. A mesma gaveta pode
   * pedir duas vezes — Escape no instante em que o envio passa a "salvando"
   * chama `onClose`, e o envio termina e chama `onUploaded` —, e o pedido a
   * mais pularia um vídeo que ninguém viu.
   */
  function avancarFila(posicao: number) {
    filaAndouEm.current = performance.now();
    setFila((atual) => {
      if (!atual || atual.total - atual.videos.length !== posicao) {
        return atual;
      }
      return atual.videos.length > 1
        ? { ...atual, videos: atual.videos.slice(1) }
        : null;
    });
  }

  /** Fechar pula só aquele vídeo: com o contador na tela, é "este não". */
  function fecharVideo(posicao: number) {
    if (
      posicao > 0 &&
      performance.now() - filaAndouEm.current < GAVETA_RECEM_ABERTA_MS
    ) {
      return;
    }
    avancarFila(posicao);
  }

  async function escolher(files: readonly File[]) {
    setAviso(null);
    setLendo(files.length);

    try {
      const fotos: File[] = [];
      const videos: File[] = [];
      const recusadas: PhotoBatchFailure[] = [];

      for (const file of files) {
        /* Saber se é vídeo pode exigir ler o começo do arquivo, e essa
           leitura falha quando o arquivo ainda não está no aparelho — o
           seletor do Android mostra arquivos da nuvem antes de baixá-los.
           Sem este `try`, a falha virava rejeição solta: nada na tela, e o
           campo travado no mesmo arquivo. */
        let ehVideo: boolean;
        try {
          ehVideo = await isVideoFile(file);
        } catch {
          recusadas.push({ file, error: NAO_LEU });
          continue;
        }

        if (!ehVideo) {
          fotos.push(file);
        } else if (aceitaVideo) {
          videos.push(file);
        } else {
          recusadas.push({ file, error: CAPA_E_FOTO });
        }
      }

      let falhasDoEnvio: readonly PhotoBatchFailure[] = [];

      if (fotos.length > 0) {
        const soltarTela = await manterTelaAcesa();

        try {
          const resultado = await depoisDoLoteAnterior(() =>
            uploadPhotos(PORTS, {
              files: fotos,
              planId,
              purpose,
              onProgress: setAndamento,
            }),
          );
          falhasDoEnvio = resultado.failures;

          /* A grade cresce foto a foto sem nada aqui: a confirmação chama
             `revalidatePath`, e o Next devolve a página re-renderizada na
             mesma resposta da action. Um `router.refresh()` por foto seria
             uma segunda renderização inteira, que o roteador enfileira na
             frente da foto seguinte. Um no fim, como sempre houve um. */
          if (resultado.uploaded.length > 0) {
            router.refresh();
          }
        } finally {
          soltarTela();
        }
      }

      const falhas = [...recusadas, ...falhasDoEnvio];
      /* Os vídeos da fila respondem na própria gaveta. O aviso fala só do
         que já tem desfecho — senão "um dos três não subiu" contaria dois
         vídeos que a pessoa ainda pode cancelar. */
      const comDesfecho = files.length - videos.length;

      if (falhas.length > 0) {
        setAviso(
          comDesfecho === 1
            ? { tipo: "frase", texto: falhas[0]!.error }
            : { tipo: "lote", escolhidos: comDesfecho, falhas },
        );
      }

      if (videos.length > 0) {
        setFila({ videos, total: videos.length });
      }
    } catch {
      /* Nada acima deveria lançar: `uploadPhotos` já transforma cada falha
         em frase. Se lançar mesmo assim, a tela não pode ficar muda. */
      setAviso({ tipo: "frase", texto: UNEXPECTED_UPLOAD_ERROR });
    } finally {
      setLendo(0);
      setAndamento(null);
      liberarInput();
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={aceitaVideo ? `${ACEITA_FOTO},${ACEITA_VIDEO}` : ACEITA_FOTO}
        multiple={varios}
        /* O controle acessível é o botão abaixo; este input é o mecanismo. Ele
           mesmo assim precisa de nome — sem rótulo, o axe reprova em
           `critical`, e um leitor de tela que chegue aqui por outro caminho
           anuncia "campo de arquivo" e nada mais. */
        aria-label={label}
        className="sr-only"
        tabIndex={-1}
        disabled={ocupado || fila !== null}
        onChange={(event) => {
          /* Copiado antes de qualquer espera: zerar o campo esvazia a
             `FileList` que o evento entregou. */
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) {
            void escolher(files);
          }
        }}
      />

      <Button
        type="button"
        variant={variant}
        size="sm"
        loading={ocupado}
        loadingLabel={
          andamento
            ? rotulo(andamento)
            : lendo === 1
              ? ROTULO.preparando
              : ROTULO_NO_LOTE.preparando
        }
        onClick={() => inputRef.current?.click()}
      >
        <ImagePlus aria-hidden="true" className="size-4" />
        {label}
      </Button>

      {/* Com a gaveta aberta, o Radix esconde o resto da página do leitor de
          tela, e um alerta que nascesse junto com ela não seria anunciado.
          Ele espera a fila de vídeos acabar para aparecer. */}
      {aviso && !fila ? <AvisoDeFalhas aviso={aviso} /> : null}

      {fila && videoDaVez ? (
        <VideoTrimSheet
          /* Um vídeo novo é uma gaveta nova: o estado da anterior — trecho,
             etapa, erro — não pode vazar para a próxima escolha. A posição
             entra na chave porque o mesmo arquivo pode vir duas vezes. */
          key={`${posicaoDaVez}:${videoDaVez.name}:${videoDaVez.size}:${videoDaVez.lastModified}`}
          file={videoDaVez}
          planId={planId}
          queue={{ current: posicaoDaVez + 1, total: fila.total }}
          /* A posição vai presa nos dois retornos: o que esta gaveta avisar
             vale para ela, nunca para a que vier depois. */
          onClose={() => fecharVideo(posicaoDaVez)}
          onUploaded={() => {
            avancarFila(posicaoDaVez);
            // A action revalidou no servidor; isto puxa o HTML novo.
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

/** O aviso de falha, como frase única ou como resumo do lote. */
function AvisoDeFalhas({ aviso }: { aviso: Aviso }) {
  if (aviso.tipo === "frase") {
    return (
      <p role="alert" className="type-body-s text-danger max-w-xs">
        {aviso.texto}
      </p>
    );
  }

  const { headline, groups } = summarizeFailures(
    aviso.escolhidos,
    aviso.falhas,
  );

  return (
    <div
      role="alert"
      className="type-body-s text-danger flex max-w-xs flex-col gap-2"
    >
      <p>{headline}</p>
      <ul className="flex flex-col gap-2">
        {groups.map(({ reason, names }) => (
          /* Nome comprido sem espaço — o Pixel grava
             `PXL_20261012_183000123.RAW-01.MP.COVER.jpg` — quebra em qualquer
             ponto. Medido no Chromium em 320px, `break-word` também cabia,
             porque a coluna do plano é `min-w-0`; `anywhere` não depende
             disso, e é o que a especificação garante em qualquer motor. */
          <li key={reason} className="wrap-anywhere">
            <span className="font-medium">{names.join(", ")}</span>: {reason}
          </li>
        ))}
      </ul>
    </div>
  );
}
