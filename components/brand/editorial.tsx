import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Reveal } from "@/components/motion/reveal";

export function Horizon({ className }: { className?: string }) {
  return (
    <svg
      data-horizon
      aria-hidden="true"
      viewBox="0 0 420 160"
      fill="none"
      className={className}
    >
      <circle cx="330" cy="35" r="14" className="fill-accent" />
      <g stroke="currentColor" strokeWidth="1">
        <path d="M-20 155C67 147 118 125 160 112S227 63 249 67 277 109 303 105 344 64 369 80 397 108 442 125" />
        <path d="M-10 145C61 130 106 116 144 122S210 149 272 133 348 104 436 137" />
        <path d="M52 168C117 130 150 134 206 140S302 180 421 164" />
      </g>
    </svg>
  );
}

export function EditorialNote({
  children,
  tone = "sage",
  className,
}: {
  children: ReactNode;
  tone?: "sage" | "blush" | "mist";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "plan-art text-text flex min-h-44 flex-col justify-center gap-5 rounded-lg p-6",
        { sage: "bg-sage-soft", blush: "bg-blush-soft", mist: "bg-mist-soft" }[
          tone
        ],
        className,
      )}
    >
      <p className="type-title max-w-[18ch]">{children}</p>
      <span className="editorial-rule" />
      <Horizon />
    </div>
  );
}

export function PhotoStory({
  children,
  image = "coast",
  className,
  priority = false,
}: {
  children?: ReactNode;
  image?: "coast" | "table";
  className?: string;
  priority?: boolean;
}) {
  return (
    <div
      className={cn(
        "photo-story flex min-h-72 flex-col justify-end p-6 sm:p-8",
        className,
      )}
    >
      <Image
        src={`/brand/photos/${image}.webp`}
        alt={
          image === "coast"
            ? "Duas pessoas contemplam o litoral ao entardecer"
            : "Mesa para dois com vista para as montanhas ao entardecer"
        }
        fill
        unoptimized
        sizes="(min-width: 1280px) 640px, (min-width: 768px) 50vw, 100vw"
        priority={priority}
        className={
          image === "coast" ? "object-cover object-right" : "object-cover"
        }
      />
      {children}
    </div>
  );
}

export function PageIntro({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-5">
      <Reveal className="flex min-w-0 flex-col gap-3">
        <span className="type-label text-text-muted">{eyebrow}</span>
        <h1 className="type-display-xl text-text break-words">{title}</h1>
        {description ? (
          <p className="type-body text-text-muted max-w-[52ch]">
            {description}
          </p>
        ) : null}
      </Reveal>
      {action}
    </header>
  );
}
