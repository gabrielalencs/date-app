/**
 * O cabeçalho `Range` da rota de leitura (D-184).
 *
 * Vídeo precisa disto: o `<video>` pede o arquivo em pedaços (`bytes=0-`,
 * depois do ponto para onde a pessoa arrastou), e há navegador que se recusa a
 * tocar quando o servidor responde tudo de uma vez com 200. Foto nunca pede
 * Range, e para ela nada muda.
 *
 * Função pura, sem `Request` e sem R2: o que se decide aqui é só aritmética
 * de bytes, e é o tipo de aritmética que erra por um.
 *
 * O que fica de fora de propósito, todos permitidos pela RFC 9110 §14.2 —
 * o servidor **pode** ignorar o Range e responder o arquivo inteiro:
 *
 * - unidade que não seja `bytes`;
 * - mais de um intervalo no mesmo pedido (`bytes=0-1,5-9`), que exigiria
 *   resposta `multipart/byteranges` — nenhum player de vídeo pede isso;
 * - intervalo malformado ou com início depois do fim.
 */

/** Intervalo fechado nas duas pontas, como no cabeçalho. */
export type ByteRange = { start: number; end: number };

export type RangeDecision =
  /** Sem Range utilizável: responde o objeto inteiro, com 200. */
  | { kind: "whole" }
  /** 206, com exatamente estes bytes. */
  | { kind: "partial"; range: ByteRange }
  /** 416: o pedido começa depois do fim do arquivo. */
  | { kind: "unsatisfiable" };

const UM_INTERVALO = /^bytes=(\d*)-(\d*)$/;

/**
 * Decide o que responder a um `Range` contra um objeto de `size` bytes.
 *
 * `maxChunk` limita o tamanho da resposta: um `bytes=0-` num vídeo de 20 MB
 * vira os primeiros `maxChunk` bytes, e o `Content-Range` diz ao navegador
 * onde parou. Responder menos do que o pedido é o que todo servidor de vídeo
 * faz, e o `<video>` pede a continuação sozinho.
 */
export function resolveRange(
  header: string | null,
  size: number,
  maxChunk: number,
): RangeDecision {
  if (header === null || size <= 0) {
    return { kind: "whole" };
  }

  const casou = UM_INTERVALO.exec(header.trim());
  if (!casou) {
    return { kind: "whole" };
  }

  const [, inicioTexto = "", fimTexto = ""] = casou;

  // `bytes=-`: nem início nem fim. Malformado, ignorado.
  if (inicioTexto === "" && fimTexto === "") {
    return { kind: "whole" };
  }

  let start: number;
  let end: number;

  if (inicioTexto === "") {
    /* Sufixo: `bytes=-500` são os últimos 500 bytes. Sufixo zero não pede
       byte nenhum, e isso é a definição de insatisfazível. */
    const sufixo = Number(fimTexto);
    if (!Number.isSafeInteger(sufixo)) return { kind: "whole" };
    if (sufixo === 0) return { kind: "unsatisfiable" };

    start = Math.max(0, size - sufixo);
    end = size - 1;
  } else {
    start = Number(inicioTexto);
    if (!Number.isSafeInteger(start)) return { kind: "whole" };

    if (fimTexto === "") {
      end = size - 1;
    } else {
      end = Number(fimTexto);
      if (!Number.isSafeInteger(end)) return { kind: "whole" };
      if (end < start) return { kind: "whole" };
    }

    if (start >= size) {
      return { kind: "unsatisfiable" };
    }
  }

  // O fim nunca passa do último byte, nem do teto de uma resposta.
  end = Math.min(end, size - 1, start + Math.max(1, maxChunk) - 1);

  return { kind: "partial", range: { start, end } };
}

/** O valor do `Content-Range` de uma resposta 206. */
export function contentRange(range: ByteRange, size: number): string {
  return `bytes ${range.start}-${range.end}/${size}`;
}

/** O valor do `Range` que vai para o R2, já resolvido e limitado. */
export function rangeHeader(range: ByteRange): string {
  return `bytes=${range.start}-${range.end}`;
}

export function rangeLength(range: ByteRange): number {
  return range.end - range.start + 1;
}
