import Image from "next/image";

import { cn } from "@/lib/cn";
import type { MediaVariant } from "@/features/media/constants";

/**
 * Fotografia servida pela nossa rota autenticada, nunca por URL do R2 (D-052).
 *
 * `unoptimized` de propósito: as dimensões já foram decididas no cliente antes
 * do upload, e o otimizador da Vercel buscaria a origem sem o cookie da pessoa
 * — receberia 404 e serviria imagem quebrada.
 *
 * `--surface-sunken` embaixo enquanto carrega, como manda a seção 4 do
 * design system. Sem skeleton animado aqui: a imagem entra por cima.
 */
export function MediaImage({
  mediaId,
  alt,
  variant = "full",
  sizes,
  priority = false,
  className,
}: {
  mediaId: string;
  alt: string;
  variant?: MediaVariant;
  sizes?: string;
  priority?: boolean;
  className?: string;
}) {
  const src =
    variant === "thumb"
      ? `/api/media/${mediaId}?v=thumb`
      : `/api/media/${mediaId}`;

  return (
    <Image
      src={src}
      alt={alt}
      fill
      unoptimized
      priority={priority}
      sizes={sizes ?? "100vw"}
      className={cn("bg-surface-sunken object-cover", className)}
    />
  );
}
