import { cn } from "@/lib/cn";

/**
 * Progresso de uma etapa que demora — converter e enviar um vídeo leva meio
 * minuto no celular. Não é spinner (D-019): a barra só cresce com o trabalho
 * feito, e o rótulo diz em palavras o que está acontecendo.
 *
 * `value` entre 0 e 1. O número também vai no texto, porque a barra sozinha
 * não é lida por ninguém que não a esteja vendo.
 */
export function Progress({
  value,
  label,
  className,
}: {
  value: number;
  label: string;
  className?: string;
}) {
  const percentual = Math.round(Math.min(Math.max(value, 0), 1) * 100);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="type-body-s text-text flex items-baseline justify-between gap-3">
        <span>{label}</span>
        <span className="tnum text-text-muted">{percentual}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentual}
        className="progress-track"
      >
        <div className="progress-fill" style={{ width: `${percentual}%` }} />
      </div>
    </div>
  );
}
