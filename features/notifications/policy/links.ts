import type { NotificationKind } from "@/features/notifications/kinds";

/**
 * O destino do clique (seção 15 do docs/NOTIFICATIONS.md).
 *
 * **Nunca** aceitar URL vinda do payload. O Service Worker recebe um `kind` e
 * um `planId` e monta o caminho aqui; um payload forjado não consegue apontar o
 * navegador da pessoa para fora do DATE, porque a URL nunca veio dele.
 *
 * Só rotas que existem de verdade. `/planos/{id}` abre mesmo com o plano
 * arquivado — foi conferido no B4 —, então o arquivamento não precisa de rota
 * própria.
 */
export function deepLinkFor(input: {
  kind: NotificationKind;
  planId: string | null;
}): string {
  if (input.planId) {
    return `/planos/${input.planId}`;
  }

  return input.kind === "date_reminder" ? "/agenda" : "/";
}

/** O que o Service Worker aceita como caminho, depois de montado. */
export function isSafeInternalPath(path: string): boolean {
  /* Uma barra, nunca duas: `//evil.com` é um caminho relativo de protocolo e o
     navegador o resolve como origem externa. */
  return /^\/(?!\/)[A-Za-z0-9\-._~!$&'()*+,;=:@/%?#[\]]*$/.test(path);
}
