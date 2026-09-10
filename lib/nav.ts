import {
  CalendarDays,
  ClipboardList,
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

/** Bottom nav: Início · Ideias · + · Agenda · Memórias (o + não é item de rota). */
export const MOBILE_NAV: readonly NavItem[] = [
  { href: "/", label: "Início", icon: House },
  { href: "/ideias", label: "Ideias", icon: Lightbulb },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/memorias", label: "Memórias", icon: Images },
];

/** Sidebar desktop. "Calendário" aponta para a mesma rota que "Agenda" no mobile. */
export const DESKTOP_NAV: readonly NavItem[] = [
  { href: "/", label: "Início", icon: House },
  { href: "/ideias", label: "Ideias", icon: Lightbulb },
  { href: "/planos", label: "Planos", icon: ClipboardList },
  { href: "/agenda", label: "Calendário", icon: CalendarDays },
  { href: "/memorias", label: "Memórias", icon: Images },
];

export const NEW_PLAN_HREF = "/novo";

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
