"use client";

import { Heart, Inbox, Search } from "lucide-react";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardMedia } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Textarea } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { PLAN_STATUSES } from "@/lib/status";

const COLOR_TOKENS = [
  "--bg",
  "--surface",
  "--surface-sunken",
  "--border",
  "--border-strong",
  "--text",
  "--text-muted",
  "--accent",
  "--accent-hover",
  "--accent-fg",
  "--positive",
  "--danger",
  "--ring",
] as const;

const TYPE_TOKENS = [
  ["type-display-xl", "Fim de semana"],
  ["type-display-l", "Fim de semana"],
  ["type-title", "Fim de semana"],
  ["type-heading", "Fim de semana"],
  ["type-body", "Fim de semana na serra, com café e caminhada."],
  ["type-body-s", "Fim de semana na serra, com café e caminhada."],
  ["type-meta", "Sábado, 14 de março · 09:00"],
  ["type-label", "Categoria"],
] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-border-subtle flex flex-col gap-4 border-t pt-8">
      <h2 className="type-label text-text-muted">{title}</h2>
      {children}
    </section>
  );
}

export function KitchenSinkShowcase() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        <h1 className="type-display-l text-text">Kitchen sink</h1>
        <p className="type-body text-text-muted">
          Todas as primitivas do B1, nos dois temas. Página não linkada.
        </p>
        <ThemeToggle />
      </header>

      <Section title="Cor">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {COLOR_TOKENS.map((token) => (
            <li
              key={token}
              className="border-border-subtle flex flex-col gap-2 rounded-md border p-3"
            >
              <span
                className="border-border-subtle h-12 w-full rounded-sm border"
                style={{ backgroundColor: `var(${token})` }}
              />
              <code className="type-meta text-text-muted">{token}</code>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Tipografia">
        <div className="flex flex-col gap-5">
          {TYPE_TOKENS.map(([className, sample]) => (
            <div key={className} className="flex flex-col gap-1">
              <code className="type-meta text-text-muted">{className}</code>
              <p className={`${className} text-text`}>{sample}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Button">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Salvar</Button>
          <Button variant="secondary">Cancelar</Button>
          <Button variant="ghost">Depois</Button>
          <Button variant="danger">Excluir</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" disabled>
            Desabilitado
          </Button>
          <Button variant="primary" loading loadingLabel="Salvando">
            Salvar
          </Button>
          <Button variant="secondary" size="sm">
            Secundário pequeno
          </Button>
          <Button variant="ghost" size="sm">
            Ghost pequeno
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" fullWidth className="sm:w-auto">
            Largura total no mobile
          </Button>
        </div>
        <p className="type-meta text-text-muted">
          Preenchimento coral ignora tamanho pequeno por D-017. Hover e active
          só aparecem com interação, não em captura estática.
        </p>
      </Section>

      <Section title="IconButton">
        <div className="flex flex-wrap items-center gap-3">
          <IconButton
            label="Buscar"
            variant="ghost"
            icon={<Search className="size-5" />}
          />
          <IconButton
            label="Favoritar"
            variant="solid"
            icon={<Heart className="size-5" />}
          />
          <IconButton
            label="Buscar"
            variant="ghost"
            disabled
            icon={<Search className="size-5" />}
          />
        </div>
      </Section>

      <Section title="Campo">
        <div className="grid gap-5 sm:grid-cols-2">
          <Input label="Título" placeholder="Jantar no centro" />
          <Input
            label="Cidade"
            defaultValue="Sao Paolo"
            error="Confira a grafia da cidade."
          />
          <Input label="Local" placeholder="Sem valor" disabled />
          <Textarea
            label="Observações"
            placeholder="Estacionamento difícil depois das 20h."
            hint="Opcional."
          />
        </div>
      </Section>

      <Section title="Card">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardBody>
              <span className="type-label text-text-muted">Restaurante</span>
              <p className="type-heading text-text">Cantina da esquina</p>
              <p className="type-body-s text-text-muted">
                Massa fresca, fila depois das 20h.
              </p>
            </CardBody>
          </Card>

          <Card variant="media" interactive>
            <CardMedia ratio="4/5" />
            <CardBody>
              <span className="type-label text-text-muted">Trilha</span>
              <p className="type-heading text-text">Pedra do Baú</p>
              <p className="type-meta tnum text-text-muted">R$ 120,00</p>
            </CardBody>
          </Card>

          <Card variant="media">
            <CardMedia ratio="16/9" />
            <CardBody>
              <p className="type-heading text-text">Destaque 16/9</p>
            </CardBody>
          </Card>
        </div>
      </Section>

      <Section title="StatusPill">
        <div className="flex flex-wrap items-center gap-2">
          {PLAN_STATUSES.map((status) => (
            <StatusPill key={status} status={status} />
          ))}
        </div>
      </Section>

      <Section title="Badge">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">Categoria</Badge>
          <Badge tone="accent">Quero muito</Badge>
          <Badge tone="positive">Confirmado</Badge>
        </div>
      </Section>

      <Section title="Skeleton">
        <div className="flex flex-col gap-3">
          <Skeleton shape="line" />
          <Skeleton shape="line" className="w-2/3" />
          <Skeleton shape="block" />
          <div className="max-w-52">
            <Skeleton shape="media" />
          </div>
        </div>
      </Section>

      <Section title="EmptyState">
        <EmptyState
          icon={Inbox}
          title="Nenhuma ideia salva ainda"
          description="Salve um link ou escreva uma ideia para começar a decidir junto."
          action={<Button variant="primary">Criar ideia</Button>}
        />
      </Section>

      <Section title="Sheet e Dialog">
        <div className="flex flex-wrap items-center gap-3">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary">Abrir sheet</Button>
            </SheetTrigger>
            <SheetContent
              title="Detalhes do plano"
              description="Sheet é o padrão no mobile."
            >
              <div className="flex flex-col gap-4">
                <p className="type-body text-text-muted">
                  Radix cuida de foco, escape e trava de scroll.
                </p>
                <SheetClose asChild>
                  <Button variant="primary">Fechar</Button>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">Abrir dialog</Button>
            </DialogTrigger>
            <DialogContent
              title="Confirmar data"
              description="Dialog é o padrão no desktop."
            >
              <div className="flex flex-col gap-4">
                <p className="type-body text-text-muted">
                  Uma opção de data pode ser promovida a data oficial.
                </p>
                <DialogClose asChild>
                  <Button variant="primary">Fechar</Button>
                </DialogClose>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </Section>
    </div>
  );
}
