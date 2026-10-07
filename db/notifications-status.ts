import { Pool, type PoolClient } from "@neondatabase/serverless";

/**
 * Onde as notificações estão parando, na branch que o arquivo de ambiente
 * carregado aponta. As métricas mínimas da seção 23 do docs/NOTIFICATIONS.md,
 * sem SaaS novo (D-181).
 *
 *   node --env-file=.env.local  ... db/notifications-status.ts
 *   node --env-file=.env.deploy ... db/notifications-status.ts
 *
 * Existe porque os dois defeitos de push em produção tiveram o mesmo sintoma —
 * nada chega — e a mesma cegueira: a tela do Perfil olha só para o navegador,
 * e o caminho entre a intent e o telefone não aparecia em lugar nenhum. O
 * D-180 foi achado com uma consulta escrita à mão; esta é ela, permanente.
 *
 * **Somente leitura**, por construção e não por cuidado: tudo roda dentro de
 * uma transação `READ ONLY`, que o Postgres recusa a escrever. Por isso não
 * pede `--eu-confirmo`, como o `db/migrations-status.ts`.
 *
 * **Nada privado na saída.** Pessoas viram letras, endpoint vira só o host do
 * push service (`fcm.googleapis.com`, `web.push.apple.com`), e nenhuma chave,
 * título de plano ou e-mail é lido. O que sai é o que a seção 23 permite logar:
 * kind, status, código de erro e horário.
 */

function hostOf(url: string): string {
  const encontrado = /@([^/:]+)/.exec(url);
  return encontrado?.[1] ?? "(host ilegível)";
}

function quando(valor: unknown): string {
  if (!valor) return "-";
  return new Date(valor as string).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Pessoas viram letras, na ordem em que aparecem. */
function apelidos(): (id: unknown) => string {
  const vistos = new Map<unknown, string>();
  return (id) => {
    if (id === null || id === undefined) return "-";
    if (!vistos.has(id)) vistos.set(id, String.fromCharCode(65 + vistos.size));
    return vistos.get(id)!;
  };
}

type Linha = Record<string, unknown>;

async function linhas(client: PoolClient, sql: string): Promise<Linha[]> {
  return (await client.query<Linha>(sql)).rows;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    throw new Error(
      "ABORTADO: DATABASE_URL_UNPOOLED não está definida. Carregue um arquivo de ambiente com --env-file.",
    );
  }

  console.log(`Neon branch : ${process.env.NEON_BRANCH ?? "(não definida)"}`);
  console.log(`Neon host   : ${hostOf(url)}`);

  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  const pessoa = apelidos();

  try {
    await client.query("BEGIN TRANSACTION READ ONLY");

    console.log("\nPessoas");
    for (const m of await linhas(
      client,
      "select profile_id, role from workspace_members order by role, profile_id",
    )) {
      console.log(`  ${pessoa(m.profile_id)}  ${m.role}`);
    }

    const inscricoes = await linhas(
      client,
      `select profile_id,
              substring(endpoint from '^https?://([^/]+)') as push_host,
              created_at, updated_at, last_success_at, disabled_at
         from push_subscriptions
        order by created_at`,
    );
    console.log(`\nAparelhos (push_subscriptions): ${inscricoes.length}`);
    if (inscricoes.length === 0) {
      console.log(
        "  nenhum — toda intent termina `suppressed` com `sem dispositivo ativo`",
      );
    }
    for (const s of inscricoes) {
      console.log(
        `  ${pessoa(s.profile_id)}  ${s.disabled_at ? "DESATIVADO" : "ativo     "}` +
          `  ${s.push_host}  criado ${quando(s.created_at)}` +
          `  último aceito ${quando(s.last_success_at)}` +
          (s.disabled_at ? `  desativado ${quando(s.disabled_at)}` : ""),
      );
    }

    console.log("\nPreferências");
    for (const p of await linhas(
      client,
      `select profile_id, push_enabled, activity_enabled,
              date_reminders_enabled, preview_mode
         from notification_preferences`,
    )) {
      console.log(
        `  ${pessoa(p.profile_id)}  push=${p.push_enabled} atividades=${p.activity_enabled}` +
          ` lembretes=${p.date_reminders_enabled} detalhes=${p.preview_mode}`,
      );
    }

    console.log("\nIntents por desfecho (das mais recentes para as antigas)");
    for (const r of await linhas(
      client,
      `select status, coalesce(last_error_code, '') as motivo,
              count(*)::int as total, max(updated_at) as ultima
         from notification_intents
        group by 1, 2
        order by ultima desc`,
    )) {
      console.log(
        `  ${String(r.total).padStart(4)}  ${String(r.status).padEnd(10)}` +
          `  última ${quando(r.ultima)}  ${r.motivo}`,
      );
    }

    console.log("\nÚltimas 15 intents");
    for (const r of await linhas(
      client,
      `select kind, status, recipient_profile_id, due_at, updated_at,
              attempt_count, workflow_run_id is null as sem_run,
              coalesce(last_error_code, '') as motivo
         from notification_intents
        order by created_at desc
        limit 15`,
    )) {
      console.log(
        `  ${String(r.kind).padEnd(15)} ${String(r.status).padEnd(10)} para ${pessoa(r.recipient_profile_id)}` +
          `  vence ${quando(r.due_at)}  fim ${quando(r.updated_at)}` +
          `  tentativas ${r.attempt_count}${r.sem_run ? "  SEM RUN" : ""}  ${r.motivo}`,
      );
    }

    const entregas = await linhas(
      client,
      `select d.status, d.last_status_code, coalesce(d.last_error_code, '') as motivo,
              substring(s.endpoint from '^https?://([^/]+)') as push_host,
              count(*)::int as total, max(d.updated_at) as ultima
         from notification_deliveries d
         join push_subscriptions s on s.id = d.subscription_id
        group by 1, 2, 3, 4
        order by ultima desc`,
    );
    console.log(
      `\nEntregas ao push service: ${entregas.length === 0 ? "nenhuma" : ""}`,
    );
    for (const r of entregas) {
      console.log(
        `  ${String(r.total).padStart(4)}  ${String(r.status).padEnd(7)}` +
          `  http ${r.last_status_code ?? "-"}  ${r.push_host}` +
          `  última ${quando(r.ultima)}  ${r.motivo}`,
      );
    }

    const [presas] = await linhas(
      client,
      `select count(*) filter (where status = 'pending'
                                 and due_at < now() - interval '30 minutes')::int as pendentes,
              count(*) filter (where status = 'processing'
                                 and updated_at < now() - interval '30 minutes')::int as processando
         from notification_intents`,
    );
    console.log(
      `\nParadas há mais de 30 min: ${presas?.pendentes ?? 0} pending vencidas,` +
        ` ${presas?.processando ?? 0} em processing`,
    );
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
