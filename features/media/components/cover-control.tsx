"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ImageOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { removeMediaAction } from "@/features/media/actions/media-actions";
import { PhotoPicker } from "@/features/media/components/photo-picker";

/**
 * A capa, dentro de "Editar detalhes" — e **sem miniatura**.
 *
 * A capa já é a maior imagem da página: ela abre o plano, em 4/3 no telefone.
 * Repetir uma miniatura dela dentro da gaveta de edição seria mostrar duas
 * vezes a mesma foto a três centímetros de distância, e a gaveta existe para
 * escrever, não para olhar. Então aqui vive só o **estado** — tem capa, não tem
 * capa — e as duas ações que mudam esse estado. A prova visual é fechar a
 * gaveta e ver a capa no lugar dela.
 *
 * Trocar é subir outra com `purpose: "cover"`: a mutation promove a nova e
 * devolve a anterior para a galeria, então nada se perde no caminho.
 */
export function CoverControl({
  planId,
  coverMediaId,
}: {
  planId: string;
  coverMediaId: string | null;
}) {
  const router = useRouter();
  const [removendo, setRemovendo] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function remover() {
    if (!coverMediaId) return;
    setRemovendo(true);
    setErro(null);

    try {
      const resultado = await removeMediaAction({
        planId,
        mediaId: coverMediaId,
      });

      if (resultado.ok) {
        setConfirmando(false);
        router.refresh();
      } else {
        setErro(resultado.error ?? "Não deu para remover a capa agora.");
      }
    } catch {
      setErro("Não deu para remover a capa agora. Tente novamente.");
    } finally {
      setRemovendo(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="type-label text-text-muted">Capa</span>

      <p className="type-body-s text-text-muted flex items-start gap-2">
        {coverMediaId ? (
          <>
            <Check
              aria-hidden="true"
              className="text-positive mt-0.5 size-4 shrink-0"
            />
            Este plano já tem capa. Ela abre a página e aparece no card das
            ideias.
          </>
        ) : (
          <>
            <ImageOff
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
              strokeWidth={1.75}
            />
            Nenhuma capa ainda. É a foto que abre o plano.
          </>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <PhotoPicker
          planId={planId}
          purpose="cover"
          label={coverMediaId ? "Trocar capa" : "Adicionar capa"}
        />

        {coverMediaId ? (
          <Dialog open={confirmando} onOpenChange={setConfirmando}>
            <DialogTrigger asChild>
              <Button type="button" variant="ghost" size="sm" disabled={removendo}>
                Remover capa
              </Button>
            </DialogTrigger>
            <DialogContent
              title="Remover a capa?"
              description="A foto sai do plano de vez. Para só trocar a imagem, use “Trocar capa” — a anterior fica guardada na galeria."
            >
              {erro ? (
                <p role="alert" className="type-body-s text-danger">
                  {erro}
                </p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-3">
                <DialogClose asChild>
                  <Button type="button" variant="secondary" disabled={removendo}>
                    Manter capa
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  variant="danger"
                  loading={removendo}
                  loadingLabel="Removendo"
                  onClick={() => void remover()}
                >
                  Remover capa
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      {erro && !confirmando ? (
        <p role="alert" className="type-meta text-danger">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
