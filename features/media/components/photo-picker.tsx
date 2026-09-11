"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  confirmUploadAction,
  startUploadAction,
} from "@/features/media/actions/media-actions";
import type { UploadablePurpose } from "@/features/media/constants";
import { browserImageRuntime } from "@/features/media/image/browser-runtime";
import { uploadPhoto, type UploadPorts } from "@/features/media/upload-flow";

/**
 * Escolher e enviar uma foto. Toda a redução acontece aqui, no aparelho, antes
 * de qualquer byte sair — o EXIF é descartado no reencode (D-051).
 *
 * Sem spinner (D-019): a espera aparece como rótulo trocado e botão
 * desabilitado. As três etapas têm nome, porque reduzir uma foto de 8 MB no
 * celular leva alguns segundos e silêncio nesse intervalo parece travamento.
 */
const PORTS: UploadPorts = {
  runtime: browserImageRuntime,
  start: startUploadAction,
  confirm: confirmUploadAction,
  async put(url, body, contentType) {
    /* Só content-type: o content-length o browser escreve sozinho a partir do
       blob, e é justamente ele que a assinatura prendeu. */
    const response = await fetch(url, {
      method: "PUT",
      headers: { "content-type": contentType },
      body,
    });
    return { status: response.status };
  },
};

type Etapa = "parado" | "preparando" | "enviando" | "salvando";

const ROTULO: Record<Etapa, string> = {
  parado: "",
  preparando: "Preparando a imagem",
  enviando: "Enviando",
  salvando: "Salvando",
};

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

  const ocupado = etapa !== "parado";

  async function escolher(file: File) {
    setErro(null);
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
      if (inputRef.current) {
        // Sem isto, escolher o mesmo arquivo de novo não dispara change.
        inputRef.current.value = "";
      }
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        disabled={ocupado}
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
    </div>
  );
}
