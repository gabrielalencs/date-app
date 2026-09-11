"use client";

import { useActionState } from "react";

import {
  signInAction,
  type SignInState,
} from "@/features/auth/actions/sign-in";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

const INITIAL: SignInState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signInAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <Input
        label="E-mail"
        name="email"
        type="email"
        autoComplete="email"
        required
        autoFocus
        placeholder="voce@exemplo.com"
      />

      <Input
        label="Senha"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />

      {/* role=alert para o leitor de tela anunciar o erro quando ele aparece. */}
      {state.error ? (
        <p role="alert" className="type-body-s text-danger">
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        fullWidth
        loading={pending}
        loadingLabel="Entrando"
      >
        Entrar
      </Button>
    </form>
  );
}
