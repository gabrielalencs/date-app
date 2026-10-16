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
import { putWithProgress } from "@/features/media/put-with-progress";
import { uploadPhoto, type UploadPorts } from "@/features/media/upload-flow";
import { isVideoFile } from "@/features/media/video/detect";

/**
 * Escolher e enviar uma foto — ou, na Galeria, um vídeo (D-184). Toda a
 * redução acontece aqui, no aparelho, antes de qualquer byte sair — o EXIF é
 * descartado no reencode (D-051).
 *
 * Sem spinner (D-019): a espera aparece como rótulo trocado e botão
 * desabilitado. As três etapas têm nome, porque reduzir uma foto de 8 MB no
 * celular leva alguns segundos e silêncio nesse intervalo parece travamento.
 *
 * Vídeo não sobe direto: ele abre a gaveta de corte, porque quase todo vídeo
 * passa do minuto e a pessoa precisa dizer qual trecho quer.
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

type Etapa = "parado" | "preparando" | "enviando" | "salvando";

const ROTULO: Record<Etapa, string> = {
  parado: "",
  preparando: "Preparando a imagem",
  enviando: "Enviando",
  salvando: "Salvando",
};

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
  const [etapa, setEtapa] = useState<Etapa>("parado");
  const [erro, setErro] = useState<string | null>(null);
  const [video, setVideo] = useState<File | null>(null);

  const ocupado = etapa !== "parado";
  const aceitaVideo = acceptsVideo(purpose);

  function liberarInput() {
    if (inputRef.current) {
      // Sem isto, escolher o mesmo arquivo de novo não dispara change.
      inputRef.current.value = "";
    }
  }

  async function escolher(file: File) {
    setErro(null);

    /* Saber se é vídeo pode exigir ler o começo do arquivo, e essa leitura
       falha quando o arquivo ainda não está no aparelho — o seletor do Android
       mostra arquivos da nuvem antes de baixá-los. Sem este `try`, a falha
       virava rejeição solta: nada na tela, e o campo travado no mesmo
       arquivo. */
    let ehVideo: boolean;
    try {
      ehVideo = await isVideoFile(file);
    } catch {
      liberarInput();
      setErro(NAO_LEU);
      return;
    }

    if (ehVideo) {
      liberarInput();

      if (aceitaVideo) {
        setVideo(file);
      } else {
        setErro(CAPA_E_FOTO);
      }
      return;
    }

    setEtapa("preparando");

    try {
      const resultado = await uploadPhoto(
        {
          ...PORTS,
          async start(input) {
            setEtapa("enviando");
            return PORTS.start(input);
          },
          async confirm(input) {
            setEtapa("salvando");
            return PORTS.confirm(input);
          },
        },
        { file, planId, purpose },
      );

      if (resultado.ok) {
        // A action revalidou no servidor; isto puxa o HTML novo.
        router.refresh();
      } else {
        setErro(resultado.error);
      }
    } catch {
      setErro("Algo deu errado no envio. Tente de novo.");
    } finally {
      setEtapa("parado");
      liberarInput();
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={aceitaVideo ? `${ACEITA_FOTO},${ACEITA_VIDEO}` : ACEITA_FOTO}
        /* O controle acessível é o botão abaixo; este input é o mecanismo. Ele
           mesmo assim precisa de nome — sem rótulo, o axe reprova em
           `critical`, e um leitor de tela que chegue aqui por outro caminho
           anuncia "campo de arquivo" e nada mais. */
        aria-label={label}
        className="sr-only"
        tabIndex={-1}
        disabled={ocupado || video !== null}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void escolher(file);
          }
        }}
      />

      <Button
        type="button"
        variant={variant}
        size="sm"
        loading={ocupado}
        loadingLabel={ROTULO[etapa]}
        onClick={() => inputRef.current?.click()}
      >
        <ImagePlus aria-hidden="true" className="size-4" />
        {label}
      </Button>

      {erro ? (
        <p role="alert" className="type-body-s text-danger max-w-xs">
          {erro}
        </p>
      ) : null}

      {video ? (
        <VideoTrimSheet
          /* Um vídeo novo é uma gaveta nova: o estado da anterior — trecho,
             etapa, erro — não pode vazar para a próxima escolha. */
          key={`${video.name}:${video.size}:${video.lastModified}`}
          file={video}
          planId={planId}
          onClose={() => setVideo(null)}
          onUploaded={() => {
            setVideo(null);
            // A action revalidou no servidor; isto puxa o HTML novo.
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
