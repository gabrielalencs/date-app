import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, beforeEach } from "vitest";

/**
 * O handler de `push` do `public/sw.js`, executado de verdade.
 *
 * Por que aqui e não no navegador: o Chromium headless reporta
 * `Notification.permission === "denied"` de forma incondicional — medido com
 * `permissions: ["notifications"]` no contexto, com `grantPermissions` por
 * origem e com flag de linha de comando, os três devolvendo `denied`. Um push
 * entregue por CDP nesse estado não vira notificação, então um teste de
 * navegador aqui mediria a limitação do ambiente, não o produto.
 *
 * O arquivo é o mesmo que vai para o ar: carregado do disco e avaliado com um
 * `self` controlado. Nada é reimplementado, então não existe a segunda versão
 * que diverge da primeira.
 */

type Notificacao = { title: string; options: Record<string, unknown> };

type Harness = {
  push: (data: unknown) => Promise<void>;
  clique: (data: unknown) => Promise<void>;
  notificacoes: Notificacao[];
  navegacoes: string[];
  abertas: string[];
  fechadas: number;
};

function carregarWorker(abasAbertas: string[] = []): Harness {
  const listeners = new Map<string, (event: unknown) => void>();
  const notificacoes: Notificacao[] = [];
  const navegacoes: string[] = [];
  const abertas: string[] = [];
  let fechadas = 0;
  const pendentes: Promise<unknown>[] = [];

  const clients = abasAbertas.map((url) => ({
    url,
    focus: async () => undefined,
    navigate: async (destino: string) => {
      navegacoes.push(destino);
    },
  }));

  const self = {
    addEventListener: (nome: string, handler: (event: unknown) => void) => {
      listeners.set(nome, handler);
    },
    location: { origin: "https://date.test" },
    registration: {
      showNotification: async (title: string, options: Record<string, unknown>) => {
        notificacoes.push({ title, options });
      },
      pushManager: { subscribe: async () => ({ toJSON: () => ({}) }) },
      unregister: async () => true,
    },
    clients: {
      matchAll: async () => clients,
      openWindow: async (url: string) => {
        abertas.push(url);
      },
      claim: async () => undefined,
    },
    skipWaiting: async () => undefined,
  };

  const sandbox = {
    self,
    caches: {
      open: async () => ({ add: async () => undefined, keys: async () => [] }),
      keys: async () => [],
      delete: async () => true,
      match: async () => undefined,
    },
    fetch: async () => ({ ok: true }),
    Response: class {
      static error() {
        return {};
      }
    },
    URL,
    JSON,
    console,
    setTimeout,
  };

  createContext(sandbox);
  runInContext(readFileSync("public/sw.js", "utf8"), sandbox);

  async function disparar(nome: string, event: Record<string, unknown>) {
    const handler = listeners.get(nome);
    if (!handler) throw new Error(`sw.js não registrou listener de ${nome}`);
    handler({
      ...event,
      waitUntil: (promessa: Promise<unknown>) => {
        pendentes.push(promessa);
      },
    });
    await Promise.all(pendentes.splice(0));
  }

  return {
    notificacoes,
    navegacoes,
    abertas,
    get fechadas() {
      return fechadas;
    },
    push: (data) =>
      disparar("push", {
        data:
          data === undefined
            ? undefined
            : {
                json: () => {
                  if (typeof data === "string") return JSON.parse(data);
                  return data;
                },
              },
      }),
    clique: (data) =>
      disparar("notificationclick", {
        notification: {
          data,
          close: () => {
            fechadas += 1;
          },
        },
      }),
  };
}

describe("push", () => {
  let worker: Harness;

  beforeEach(() => {
    worker = carregarWorker();
  });

  it("um payload válido vira notificação com ícone e badge do DATE", async () => {
    await worker.push({
      title: "Agora tem data",
      body: "“Jantar no Centro” está planejado para sábado.",
      url: "/planos/abc",
      kind: "date_confirmed",
    });

    expect(worker.notificacoes).toHaveLength(1);
    const [notificacao] = worker.notificacoes;
    expect(notificacao!.title).toBe("Agora tem data");
    expect(notificacao!.options.icon).toBe("/brand/icons/icon-192.png");
    expect(notificacao!.options.badge).toBe("/brand/icons/badge-96.png");
    expect(notificacao!.options.lang).toBe("pt-BR");
    expect(notificacao!.options.data).toEqual({ url: "/planos/abc" });
    /* A tag é o que substitui a notificação anterior do mesmo assunto em vez de
       empilhar duas sobre o mesmo plano. */
    expect(String(notificacao!.options.tag)).toContain("date_confirmed");
  });

  it("URL externa no payload nunca chega ao destino", async () => {
    for (const url of [
      "https://evil.example/roubo",
      "//evil.example/roubo",
      "javascript:alert(1)",
      "/../../etc",
    ]) {
      await worker.push({ title: "t", body: "b", url, kind: "plan_created" });
    }

    /* `//evil.example` é caminho relativo de protocolo: sem a checagem da barra
       dupla, o navegador o resolveria como origem de fora. */
    for (const notificacao of worker.notificacoes) {
      const destino = (notificacao.options.data as { url: string }).url;
      expect(destino.startsWith("//")).toBe(false);
      expect(destino).not.toContain("evil.example");
      expect(destino).not.toContain("javascript:");
    }
  });

  it("payload malformado falha seguro, sem notificação e sem exceção", async () => {
    await worker.push(undefined);
    await worker.push({ body: "sem título" });
    await worker.push({ title: "" });
    await worker.push({ title: 42, body: {} });

    expect(worker.notificacoes).toHaveLength(0);
  });

  it("texto longo é truncado antes de virar notificação", async () => {
    await worker.push({
      title: "T".repeat(500),
      body: "B".repeat(2000),
      url: "/",
      kind: "plan_created",
    });

    const [notificacao] = worker.notificacoes;
    expect(notificacao!.title).toHaveLength(120);
    expect(String(notificacao!.options.body)).toHaveLength(300);
  });

  it("nada do payload é executado: só título, corpo, kind e caminho passam", async () => {
    await worker.push({
      title: "t",
      body: "b",
      url: "/planos/abc",
      kind: "plan_created",
      /* Campos extras são ignorados, não repassados. Se um dia o payload trouxer
         `onclick` ou `script`, ele morre aqui. */
      onclick: "alert(1)",
      script: "<script>alert(1)</script>",
    });

    const [notificacao] = worker.notificacoes;
    expect(notificacao!.options).not.toHaveProperty("onclick");
    expect(notificacao!.options).not.toHaveProperty("script");
    expect(notificacao!.options.data).toEqual({ url: "/planos/abc" });
  });
});

describe("notificationclick", () => {
  it("foca a aba existente e navega para o caminho interno", async () => {
    const worker = carregarWorker(["https://date.test/agenda"]);
    await worker.clique({ url: "/planos/abc" });

    expect(worker.navegacoes).toEqual(["/planos/abc"]);
    expect(worker.abertas).toEqual([]);
    expect(worker.fechadas).toBe(1);
  });

  it("sem aba do DATE aberta, abre uma", async () => {
    const worker = carregarWorker(["https://outro.site/qualquer"]);
    await worker.clique({ url: "/memorias" });

    expect(worker.abertas).toEqual(["/memorias"]);
  });

  it("dado ausente ou externo cai para a raiz", async () => {
    const worker = carregarWorker([]);
    await worker.clique(null);
    await worker.clique({ url: "https://evil.example" });

    expect(worker.abertas).toEqual(["/", "/"]);
  });
});
