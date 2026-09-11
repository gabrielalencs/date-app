"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { isAllowedEmail, normalizedEmail } from "@/lib/auth/config";
import { getAuthConfig } from "@/lib/auth/env";
import { getAuth } from "@/lib/auth/server";

/** Mensagem única: não vazamos se o e-mail existe, nem o texto do provedor. */
const GENERIC_ERROR = "E-mail ou senha inválidos.";

export type SignInState = { error?: string };

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(200),
});

export async function signInAction(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = credentialsSchema.safeParse({
    email: normalizedEmail(String(formData.get("email") ?? "")),
    password: String(formData.get("password") ?? ""),
  });

  // Payload inválido nunca chega ao provedor.
  if (!parsed.success) {
    return { error: GENERIC_ERROR };
  }

  const { email, password } = parsed.data;

  /* redirect() sinaliza por exceção, então fica fora do try: o catch aqui é só
     para falha de provedor ou de configuração, que não pode virar 500 na cara
     de quem só tentou entrar. */
  let authenticated = false;

  try {
    // A allowlist é verificada antes de gastar uma tentativa no provedor.
    if (!isAllowedEmail(email, getAuthConfig().allowedEmails)) {
      return { error: GENERIC_ERROR };
    }

    const { error } = await getAuth().signIn.email({ email, password });
    authenticated = !error;
  } catch {
    // Sem detalhe e sem segredo: configuração inválida falha fechada.
    console.error("[auth] falha ao processar login; verifique a configuração.");
    return { error: GENERIC_ERROR };
  }

  if (!authenticated) {
    return { error: GENERIC_ERROR };
  }

  redirect("/");
}
