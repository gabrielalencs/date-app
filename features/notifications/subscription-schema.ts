import { z } from "zod";

/**
 * O boundary da subscription, compartilhado pela Server Action e pela rota do
 * Service Worker.
 *
 * **A forma é a de `PushSubscription.toJSON()`, e ela tem três campos, não
 * dois.** Chrome, Safari e Firefox devolvem `expirationTime` — quase sempre
 * `null` — ao lado de `endpoint` e `keys`. A primeira versão deste schema
 * listava só os dois e era `strictObject`, então recusava com
 * `unrecognized_keys` **toda** subscription real: o navegador se inscrevia, o
 * servidor não gravava nada e a tela do Perfil, que olha só para o navegador,
 * dizia "recebendo notificações". Em produção, `push_subscriptions` ficou vazia
 * e cada intent terminou como `sem dispositivo ativo` (D-180).
 *
 * Continua estrito para todo o resto: um corpo que tente dizer de quem é a
 * subscription (`profileId`, `workspaceId`) é recusado, porque quem ela é sai
 * sempre do contexto autenticado.
 *
 * Mora fora de `actions/` porque um arquivo `"use server"` só exporta função
 * assíncrona, e fora de `data/` porque não toca o banco. Só o servidor importa:
 * o Zod não entra no bundle do navegador (D-167).
 */
export const pushSubscriptionSchema = z.strictObject({
  endpoint: z.url().max(2048),
  /* Não é gravado: o DATE trata a expiração pelo 404/410 do push service e
     pelo `pushsubscriptionchange`. Aceito só para o `toJSON()` passar. */
  expirationTime: z.number().nullable().optional(),
  keys: z.strictObject({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(256),
  }),
});
