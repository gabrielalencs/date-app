"use client";

import { useEffect } from "react";
import { RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * O que a pessoa vê quando uma rota privada quebra.
 *
 * Sem este arquivo, um erro de servidor entrega a tela padrão do Next: fundo
 * branco, tipografia do framework e, em produção, a palavra "error" com um
 * digest. Isso não é só feio — é o único momento em que o produto deixa de
 * parecer o produto, e acontece justamente quando a pessoa já está frustrada.
 *
 * O texto não repassa `error.message`: mensagem de erro de servidor pode
 * carregar nome de tabela, id ou trecho de consulta, e nada disso é assunto de
 * quem está tentando ver os planos do fim de semana. O `digest` aparece porque
 * é a única coisa que liga esta tela à linha do log do servidor.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    /* Em desenvolvimento, o erro inteiro no terminal de quem está trabalhando.
       Em produção o Next já registra por conta própria, e repetir aqui só
       duplicaria a linha. */
    if (process.env.NODE_ENV !== "production") {
      console.warn("[DATE] erro numa rota privada:", error);
    }
  }, [error]);

  return (
    <div className="page-stack">
      <div className="flex max-w-prose flex-col gap-4">
        <span className="type-label text-text-muted">Algo saiu do lugar</span>
        <h1 className="type-display-l">Essa tela não carregou.</h1>
        <p className="type-body text-text-muted">
          O erro é do nosso lado, não do que vocês fizeram. Nada do que já estava
          salvo se perdeu.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={reset}>
            <RotateCw aria-hidden="true" className="size-4" />
            Tentar de novo
          </Button>
        </div>

        {error.digest ? (
          <p className="type-meta text-text-muted pt-2">
            Referência: <span className="tnum">{error.digest}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
