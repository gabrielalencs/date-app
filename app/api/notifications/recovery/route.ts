import { timingSafeEqual } from "node:crypto";

import { listRecoverableIntents } from "@/features/notifications/data/system";
import { startNotificationWorkflows } from "@/features/notifications/workflow/start";

/**
 * Reparo de outbox (seção 4.4 do docs/NOTIFICATIONS.md).
 *
 * **Não é o scheduler.** O agendamento é do Vercel Workflow; esta rota existe
 * para o caso em que o `start()` falhou depois do commit e a intent ficou
 * `pending` sem run. Ela não envia nada: reinicia o workflow, e quem decide o
 * que acontece é o claim.
 *
 * Idempotente por construção — reiniciar um run de uma intent que já foi
 * processada termina em `stop` no primeiro step, e duas execuções do cron
 * disputam o mesmo claim, que só uma leva.
 */
export const dynamic = "force-dynamic";

/** Teto por execução: reparo é gota a gota, não enxurrada. */
const LOTE = 100;

/**
 * Comparação em tempo constante.
 *
 * `===` em segredo vaza o tamanho do prefixo correto pelo tempo de resposta.
 * Custa uma linha fazer certo, e esta rota é a única superfície do projeto que
 * autentica por segredo compartilhado em vez de sessão.
 */
function segredoConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: Request): Promise<Response> {
  const esperado = process.env.CRON_SECRET;

  /* Sem segredo configurado, a rota não existe. Falhar fechado: uma rota de
     manutenção que funciona sem autenticação porque a variável não foi definida
     é pior que uma rota ausente. */
  if (!esperado) {
    return new Response(null, { status: 404 });
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token || !segredoConfere(token, esperado)) {
    return new Response(null, { status: 401 });
  }

  const pendentes = await listRecoverableIntents(new Date(), LOTE);
  await startNotificationWorkflows(pendentes.map((linha) => linha.id));

  /* Só contagem. Nem id de plano, nem destinatário, nem endpoint: a resposta de
     uma rota autenticada por segredo compartilhado não carrega dado do casal. */
  return Response.json({ recuperadas: pendentes.length });
}
