import Image from "next/image";
import { cn } from "@/lib/cn";

/** Assets oficiais, sem recompor ou redesenhar a assinatura da marca. */
export function Wordmark({
  tagline = false,
  onPhoto = false,
  className,
}: {
  tagline?: boolean;
  onPhoto?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex w-44 flex-col", className)}>
      <Image
        src="/brand/logos/date-logo.svg"
        alt="date"
        width={220}
        height={92}
        unoptimized
        className={onPhoto ? "hidden" : "w-full dark:hidden"}
      />
      <Image
        src="/brand/logos/date-logo-on-dark.svg"
        alt="date"
        width={220}
        height={92}
        unoptimized
        className={
          onPhoto ? "w-full rounded-md" : "hidden w-full rounded-md dark:block"
        }
      />
      {tagline ? (
        <span className="mt-1 text-center text-xs leading-relaxed tracking-[0.13em] uppercase">
          Planejar hoje,
          <br />
          viver juntos sempre
        </span>
      ) : null}
    </span>
  );
}
