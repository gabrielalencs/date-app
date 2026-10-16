import type { PutOptions } from "@/features/media/upload-flow";

/**
 * O PUT assinado, com progresso (D-184).
 *
 * `fetch` não informa quanto do corpo já subiu, e um vídeo de 20 MB pelo 4G
 * leva meio minuto: sem número na tela, meio minuto parado parece
 * travamento. `XMLHttpRequest` é a única API do navegador que dá o progresso
 * do envio.
 *
 * Só `content-type` vai como cabeçalho: o `content-length` o navegador escreve
 * sozinho a partir do blob, e é justamente ele que a assinatura prendeu.
 *
 * Falha de rede resolve com status 0, que o fluxo trata como "falhou no meio
 * do caminho"; cancelamento rejeita, porque não é falha a mostrar.
 */
export function putWithProgress(
  url: string,
  body: Blob,
  contentType: string,
  { onProgress, signal }: PutOptions = {},
): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Envio cancelado.", "AbortError"));
      return;
    }

    const xhr = new XMLHttpRequest();
    const abortar = () => xhr.abort();

    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", contentType);

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          onProgress(event.loaded / event.total);
        }
      };
    }

    xhr.onload = () => {
      signal?.removeEventListener("abort", abortar);
      resolve({ status: xhr.status });
    };
    xhr.onerror = () => {
      signal?.removeEventListener("abort", abortar);
      resolve({ status: 0 });
    };
    xhr.onabort = () => {
      signal?.removeEventListener("abort", abortar);
      reject(new DOMException("Envio cancelado.", "AbortError"));
    };

    signal?.addEventListener("abort", abortar, { once: true });
    xhr.send(body);
  });
}
