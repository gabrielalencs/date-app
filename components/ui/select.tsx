"use client";

import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type SelectOption = { value: string; label: string; disabled?: boolean };
const EMPTY_VALUE = "__date_empty__";

export function DateSelect({
  id,
  labelId,
  descriptionId,
  invalid,
  name,
  defaultValue,
  options,
  disabled,
  required,
  icon,
  className,
  onValueChange,
}: {
  id: string;
  labelId: string;
  descriptionId?: string;
  invalid?: boolean;
  name?: string;
  defaultValue?: string;
  options: SelectOption[];
  disabled?: boolean;
  required?: boolean;
  icon?: ReactNode;
  className?: string;
  onValueChange?: (value: string) => void;
}) {
  const initialValue = defaultValue ?? options[0]?.value ?? "";
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = inputRef.current?.form;
    const reset = () => setValue(initialValue);
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [initialValue]);

  /**
   * Tocar no gatilho com o painel aberto precisa **fechar**.
   *
   * O Radix nunca alterna: `handleOpen` so chama `onOpenChange(true)`. Com o
   * painel aberto, o Radix tambem poe `pointer-events: none` no `body`, e e
   * isso que torna o problema dificil de enxergar. Medido no Chromium com
   * toque, tocando no proprio gatilho com o painel aberto:
   *
   *   pointerdown  target=HTML   <- o gatilho NAO recebe o evento
   *   touchstart   target=HTML   <- aqui o painel ja fechou (DismissableLayer)
   *   click        target=SPAN   <- o body voltou a receber ponteiro, o clique
   *                                 chega ao gatilho e `handleOpen` reabre
   *
   * O resultado e um botao que parece morto: o dedo toca e a tela nao muda.
   *
   * Por isso a guarda **nao pode** depender do `pointerdown` do gatilho — ele
   * nunca acontece. Quem sabe onde o dedo encostou e o proprio painel, pelo
   * `onPointerDownOutside`: ele carrega o evento original, e comparar as
   * coordenadas com a caixa do gatilho diz se o toque que fechou o painel foi
   * em cima dele. Nesse caso o clique seguinte — o mesmo gesto — e cancelado, e
   * o `composeEventHandlers` do Radix pula o `handleOpen` dele.
   *
   * Sem relogio e sem tempo de espera: a marca e consumida pelo clique daquele
   * gesto, e qualquer `pointerdown` novo no gatilho (que so acontece com o
   * painel fechado) a limpa.
   */
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const suprimirClique = useRef(false);

  return (
    <Select.Root
      open={open}
      onOpenChange={setOpen}
      value={value || EMPTY_VALUE}
      disabled={disabled}
      required={required}
      onValueChange={(next) => {
        const actual = next === EMPTY_VALUE ? "" : next;
        setValue(actual);
        onValueChange?.(actual);
      }}
    >
      {/* O valor vazio dos filtros permanece vazio no GET/Server Action. */}
      <input
        ref={inputRef}
        type="hidden"
        name={name}
        value={value}
        disabled={disabled}
      />
      <Select.Trigger
        id={id}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        aria-invalid={invalid || undefined}
        ref={triggerRef}
        onPointerDown={() => {
          /* So chega aqui com o painel fechado; serve para limpar uma marca
             que tenha sobrado de um gesto sem clique. */
          suprimirClique.current = false;
        }}
        onClick={(event) => {
          if (suprimirClique.current) {
            suprimirClique.current = false;
            event.preventDefault();
          }
        }}
        className={cn(
          "field-frame min-h-[3.25rem] w-full text-left disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        data-invalid={!!invalid}
      >
        {icon ? (
          <span className="field-icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate px-4 text-base">
          <Select.Value />
        </span>
        <Select.Icon className="text-text-muted pr-4">
          <ChevronDown className="size-4" aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={8}
          collisionPadding={12}
          onPointerDownOutside={(event) => {
            /* O alvo do evento e o <html>, por causa do `pointer-events: none`
               no body — entao quem responde "foi no gatilho?" e a geometria. */
            const caixa = triggerRef.current?.getBoundingClientRect();
            const origem = event.detail.originalEvent;
            if (!caixa) return;

            const dentro =
              origem.clientX >= caixa.left &&
              origem.clientX <= caixa.right &&
              origem.clientY >= caixa.top &&
              origem.clientY <= caixa.bottom;

            if (dentro) suprimirClique.current = true;
          }}
          className="border-border-strong bg-surface text-text shadow-raised z-50 w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-24px)] overflow-hidden rounded-md border"
        >
          {/* Entrada do painel por CSS. O atributo fica: é por ele que o teste
              do R1 confere que o painel chega a opacidade 1. */}
          <div data-date-select-motion className="pop">
            {/*
              Sem `Select.ScrollUpButton`/`ScrollDownButton`.

              As duas são afordância de mouse: rolam enquanto o ponteiro
              repousa em cima delas. No celular não existe repousar, então elas
              não faziam nada além de ocupar 44px em cada ponta e sugerir que a
              lista rolava de algum jeito que o dedo não encontrava. Medido: a
              categoria tem 408px de conteúdo em 320px de painel, ou seja a
              lista rola mesmo — o que faltava era deixar o navegador rolar.

              Sem elas o `overflow-y: auto` do viewport volta a valer, com
              inércia nativa. `overscroll-contain` impede que o fim da lista
              vire rolagem da página atrás.
            */}
            <Select.Viewport className="max-h-[min(20rem,var(--radix-select-content-available-height))] overscroll-contain p-1.5">
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value || EMPTY_VALUE}
                  disabled={option.disabled}
                  textValue={option.label}
                  className="data-[highlighted]:bg-mist-soft relative flex min-h-11 cursor-pointer items-center gap-3 rounded-sm py-3 pr-10 pl-3 text-sm data-[disabled]:pointer-events-none data-[disabled]:opacity-45 data-[state=checked]:font-semibold"
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator className="absolute right-3">
                    <Check aria-hidden="true" className="size-4" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </div>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
