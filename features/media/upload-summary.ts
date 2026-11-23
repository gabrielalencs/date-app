import type { PhotoBatchFailure } from "@/features/media/upload-flow";

/** Os arquivos que falharam pelo mesmo motivo, na ordem em que vieram. */
export type FailureGroup = { reason: string; names: string[] };

/**
 * O aviso de um lote que não subiu inteiro: uma frase com quantos falharam,
 * e os nomes agrupados por frase de motivo idêntica — a recusa do servidor,
 * a rede que caiu, o arquivo que ainda está na nuvem, o vídeo na capa viram
 * uma linha com vários nomes. A frase de foto que não decodifica traz o
 * tipo, o tamanho e a causa de cada arquivo, para diagnóstico; ela não se
 * agrupa, e não deve, porque cada uma diz uma coisa diferente.
 *
 * Sem React, para cada ramo da frase — nenhum, um, vários — ser provado em
 * teste sem montar a tela.
 */
export function summarizeFailures(
  chosen: number,
  failures: readonly PhotoBatchFailure[],
): { headline: string; groups: FailureGroup[] } {
  const porMotivo = new Map<string, string[]>();

  for (const { file, error } of failures) {
    const nomes = porMotivo.get(error);
    if (nomes) {
      nomes.push(file.name);
    } else {
      porMotivo.set(error, [file.name]);
    }
  }

  const falharam = failures.length;
  const headline =
    falharam >= chosen
      ? `Nenhum dos ${chosen} arquivos subiu.`
      : falharam === 1
        ? `Um dos ${chosen} arquivos não subiu.`
        : `${falharam} dos ${chosen} arquivos não subiram.`;

  return {
    headline,
    groups: [...porMotivo].map(([reason, names]) => ({ reason, names })),
  };
}
