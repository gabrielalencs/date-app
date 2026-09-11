import {
  Clapperboard,
  Compass,
  House,
  Landmark,
  Mountain,
  Music2,
  Plane,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { Horizon } from "@/components/brand/editorial";
import { categoryLabel, toCategory, type Category } from "@/lib/categories";
import { cn } from "@/lib/cn";

const APPEARANCE: Record<Category, { icon: LucideIcon; surface: string }> = {
  gastronomia: { icon: Utensils, surface: "bg-blush-soft" },
  cinema_teatro: { icon: Clapperboard, surface: "bg-mist-soft" },
  musica: { icon: Music2, surface: "bg-taupe-soft" },
  viagem: { icon: Plane, surface: "bg-mist-soft" },
  ar_livre: { icon: Mountain, surface: "bg-sage-soft" },
  cultura: { icon: Landmark, surface: "bg-taupe-soft" },
  em_casa: { icon: House, surface: "bg-blush-soft" },
  outro: { icon: Compass, surface: "bg-sage-soft" },
};

/** Capa editorial, nunca uma foto de outro lugar apresentada como a do plano. */
export function CategoryArt({
  category,
  title,
  className,
  cancelled = false,
}: {
  category: string | null;
  title?: string;
  className?: string;
  cancelled?: boolean;
}) {
  const { icon: Icon, surface } = APPEARANCE[toCategory(category)];
  return (
    <div
      className={cn(
        "plan-art text-text flex flex-col justify-between gap-6 p-5",
        surface,
        className,
      )}
    >
      <span className="type-label flex items-center gap-2">
        <Icon
          aria-hidden="true"
          className="size-4 shrink-0"
          strokeWidth={1.5}
        />
        {categoryLabel(category)}
      </span>
      {title ? (
        <p
          className={cn(
            "font-display line-clamp-3 text-[1.65rem] leading-tight tracking-tight break-words",
            cancelled && "line-through",
          )}
        >
          {title}
        </p>
      ) : (
        <Icon aria-hidden="true" className="mx-auto size-12" strokeWidth={1} />
      )}
      <Horizon />
    </div>
  );
}
