import {
  CalendarDays,
  House,
  Images,
  Lightbulb,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

/**
 * Navegação idêntica nos dois breakpoints (D-021). `/agenda` é a seção única —
 * a alternância interna entre lista e calendário é do B7, quando houver plano
 * para listar. `/planos` não existe mais.
 */
export const NAV: readonly NavItem[] = [
  { href: "/", label: "Início", icon: House },
  { href: "/ideias", label: "Ideias", icon: Lightbulb },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/memorias", label: "Memórias", icon: Images },
];

export const NEW_PLAN_HREF = "/novo";
export const PROFILE_HREF = "/perfil";

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
