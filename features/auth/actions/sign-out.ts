"use server";

import { redirect } from "next/navigation";

import { getAuth } from "@/lib/auth/server";

/** Invalida a sessão no Neon; não é limpeza de estado do React. */
export async function signOutAction(): Promise<void> {
  await getAuth().signOut();
  redirect("/login");
}
