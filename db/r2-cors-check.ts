/**
 * O CORS do R2, conferido do jeito que o navegador confere.
 *
 * **Por que este script existe.** O upload do DATE é um PUT assinado que sai do
 * navegador direto para o bucket (`docs/MEDIA_R2.md` seção 2). Como o pedido
 * leva `content-type: image/webp`, que não está na lista segura do CORS, o
 * navegador manda antes um `OPTIONS` de verificação. Se o bucket não responder
 * a esse `OPTIONS` autorizando a origem, o PUT nunca acontece — e o sintoma é
 * uma foto que simplesmente não sobe, sem erro visível na tela.
 *
 * O `docs/PRODUCTION.md` seção 9 avisa que este é o item mais fácil de deixar
 * para depois, "porque login funciona, a home aparece, tudo parece pronto, e o
 * upload só quebra quando alguém tenta a primeira foto".
 *
 * O token de aplicação é limitado a objeto e **não** lê configuração de bucket,
 * então não dá para consultar as regras direto — o que este script faz é o
 * mesmo que o navegador faria, que é a única prova que interessa.
 *
 * Uso:
 *   pnpm r2:cors                         confere as origens de desenvolvimento
 *   pnpm r2:cors https://seu.dominio     confere também a de produção
 */

/* `export {}` faz do arquivo um módulo, que é o que o TypeScript exige para
   aceitar `await` no topo. */
export {};

const DEV_ORIGINS = ["http://localhost:3000", "http://localhost:3100"];

type Resultado = {
  bucket: string;
  origem: string;
  status: number;
  permitido: boolean;
  metodos: string | null;
  headers: string | null;
};

async function verificar(
  endpoint: string,
  bucket: string,
  origem: string,
): Promise<Resultado> {
  /* Chave inventada de propósito: o `OPTIONS` é respondido pela configuração do
     bucket e não toca em objeto nenhum. Nada é criado, nada é lido. */
  const url = `${endpoint.replace(/\/$/, "")}/${bucket}/cors-check/probe.webp`;

  const resposta = await fetch(url, {
    method: "OPTIONS",
    headers: {
      origin: origem,
      "access-control-request-method": "PUT",
      "access-control-request-headers": "content-type",
    },
  });

  const permite = resposta.headers.get("access-control-allow-origin");

  return {
    bucket,
    origem,
    status: resposta.status,
    permitido: Boolean(permite),
    metodos: resposta.headers.get("access-control-allow-methods"),
    headers: resposta.headers.get("access-control-allow-headers"),
  };
}

async function main(): Promise<void> {
  const endpoint = process.env.R2_ENDPOINT;
  if (!endpoint) {
    throw new Error("R2_ENDPOINT não está definida.");
  }

  const origemProd = process.argv[2];
  const alvos: { bucket: string; origens: string[] }[] = [
    { bucket: "date-media-dev", origens: DEV_ORIGINS },
    {
      bucket: "date-media-prod",
      origens: origemProd ? [origemProd] : [],
    },
  ];

  console.log("Verificação de CORS, igual à que o navegador faz antes do PUT.\n");

  let faltou = false;

  for (const alvo of alvos) {
    if (alvo.origens.length === 0) {
      console.log(
        `${alvo.bucket}: nenhuma origem informada. ` +
          `Rode com a URL de produção para conferir este bucket.\n`,
      );
      continue;
    }

    for (const origem of alvo.origens) {
      const r = await verificar(endpoint, alvo.bucket, origem);
      const marca = r.permitido ? "ok  " : "FALHA";
      console.log(
        `${marca} ${r.bucket.padEnd(16)} ${r.origem.padEnd(34)} ` +
          `HTTP ${r.status} · métodos: ${r.metodos ?? "—"} · headers: ${r.headers ?? "—"}`,
      );
      if (!r.permitido) faltou = true;
    }
    console.log();
  }

  if (faltou) {
    console.log(
      "Uma origem sem CORS significa upload quebrado naquela origem.\n" +
        "No painel do Cloudflare, em R2 → o bucket → Settings → CORS policy:\n\n" +
        JSON.stringify(
          [
            {
              AllowedOrigins: ["https://SEU-DOMINIO"],
              AllowedMethods: ["PUT"],
              AllowedHeaders: ["content-type"],
              MaxAgeSeconds: 3600,
            },
          ],
          null,
          2,
        ) +
        "\n\nSó a origem real, nunca `*`. As origens de localhost ficam no bucket\n" +
        "de desenvolvimento, não no de produção.",
    );
    process.exitCode = 1;
  }
}

await main();
