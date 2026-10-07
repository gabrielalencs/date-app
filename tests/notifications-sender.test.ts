import { createECDH, randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applicationServerKeyBytes,
  isSubscribedWithOtherKey,
} from "@/features/notifications/application-server-key";
import {
  classifyPushStatus,
  pushServiceReason,
  TEST_PUSH_KIND,
  type PushPayload,
} from "@/features/notifications/send/sender";
import { testPushStateFor } from "@/features/notifications/send/test-push";
import { vapidPairMatches } from "@/features/notifications/send/vapid";

/**
 * O envio de verdade, sem rede (D-181).
 *
 * Até aqui toda a suíte injetava um remetente falso, então nenhum teste
 * atravessava o `web-push`, a leitura das chaves ou a classificação de uma
 * recusa real. É o ponto cego do D-180 um passo adiante: em produção, o
 * remetente real só começou a rodar quando a primeira subscription foi gravada.
 *
 * O `web-push` entra de verdade para gerar e validar chaves. Só o
 * `sendNotification` — a única chamada que sai da máquina — é substituído.
 */

const envio = vi.hoisted(() => ({ sendNotification: vi.fn() }));

vi.mock("web-push", async (importOriginal) => {
  const real = await importOriginal<{ default: Record<string, unknown> }>();
  return {
    default: { ...real.default, sendNotification: envio.sendNotification },
  };
});

type ParVapid = { publicKey: string; privateKey: string };

/** O gerador da própria biblioteca: ele completa a chave privada com zeros à esquerda. */
async function parVapid(): Promise<ParVapid> {
  const real = await vi.importActual<{
    default: { generateVAPIDKeys(): ParVapid };
  }>("web-push");
  return real.default.generateVAPIDKeys();
}

type DetalhesDoEnvio = { headers: Record<string, unknown> };

/**
 * A montagem da requisição pela biblioteca de verdade, sem enviá-la. É ela que
 * valida as opções: uma que o `web-push` não conhecesse estouraria aqui — e no
 * app, onde o erro não tem status HTTP, viraria um `network` mudo.
 */
async function montarRequisicao(...args: unknown[]): Promise<DetalhesDoEnvio> {
  const real = await vi.importActual<{
    default: { generateRequestDetails(...args: unknown[]): DetalhesDoEnvio };
  }>("web-push");
  return real.default.generateRequestDetails(...args);
}

/** As chaves que um navegador de verdade entrega no `toJSON()`. */
function chavesDeNavegador() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    p256dh: ecdh.getPublicKey().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
  };
}

/** Módulo novo a cada teste: o remetente guarda a configuração da primeira chamada. */
async function remetente() {
  vi.resetModules();
  const modulo = await import("@/features/notifications/send/web-push-sender");
  return modulo.webPushSender;
}

function configurar(publicKey: string, privateKey: string, subject: string) {
  vi.stubEnv("NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY", publicKey);
  vi.stubEnv("WEB_PUSH_VAPID_PRIVATE_KEY", privateKey);
  vi.stubEnv("WEB_PUSH_VAPID_SUBJECT", subject);
}

/* Valores de fixture: o envio está substituído e nada aqui sai da máquina. */
const ALVO = {
  endpoint: "https://push.invalid/fixture-sender",
  p256dh: "fixture-p256dh",
  auth: "fixture-auth",
};

const PAYLOAD: PushPayload = {
  title: "Notificações funcionando",
  body: "Fixture.",
  url: "/perfil",
  kind: TEST_PUSH_KIND,
};

/** O que o `web-push` rejeita quando o push service responde fora de 2xx. */
function recusa(statusCode: number, body: string) {
  return Object.assign(new Error("Received unexpected response code"), {
    statusCode,
    body,
  });
}

describe("o motivo que o push service escreve na recusa", () => {
  it("lê o JSON da Apple", () => {
    expect(pushServiceReason('{"reason":"BadJwtToken"}')).toBe("BadJwtToken");
  });

  it("lê o identificador solto do FCM", () => {
    expect(pushServiceReason("UnauthorizedRegistration\n")).toBe(
      "UnauthorizedRegistration",
    );
  });

  it("descarta tudo que não for um identificador curto", () => {
    /* O corpo é texto de terceiro com destino a uma coluna de banco: um eco do
       endpoint ali gravaria credencial de entrega no diagnóstico. */
    for (const corpo of [
      "<html><body>Bad Request</body></html>",
      "the key in the authorization header does not correspond",
      '{"reason":"https://fcm.googleapis.com/fcm/send/abc"}',
      `{"reason":"${"A".repeat(49)}"}`,
      "",
    ]) {
      expect(pushServiceReason(corpo), corpo).toBeUndefined();
    }

    expect(pushServiceReason(undefined)).toBeUndefined();
    expect(pushServiceReason(403)).toBeUndefined();
  });

  it("entra no código da falha, e só da falha", () => {
    expect(classifyPushStatus(403, "BadJwtToken")).toEqual({
      status: "failed",
      statusCode: 403,
      errorCode: "http_403:BadJwtToken",
    });
    expect(classifyPushStatus(429, "TooManyRequests")).toMatchObject({
      errorCode: "rate_limited:TooManyRequests",
    });
    expect(classifyPushStatus(410, "Unregistered")).toEqual({
      status: "stale",
      statusCode: 410,
    });
  });
});

describe("o par VAPID", () => {
  it("reconhece a privada da própria pública", async () => {
    const par = await parVapid();
    expect(vapidPairMatches(par.publicKey, par.privateKey)).toBe(true);
  });

  it("recusa a pública de um par com a privada de outro", async () => {
    /* A rotação feita pela metade: o navegador se inscreve com uma chave e o
       servidor assina com outra. */
    const a = await parVapid();
    const b = await parVapid();
    expect(vapidPairMatches(a.publicKey, b.privateKey)).toBe(false);
  });

  it("recusa o que não é chave, sem lançar", () => {
    expect(vapidPairMatches("nao-e-chave", "tambem-nao")).toBe(false);
    expect(vapidPairMatches("", "")).toBe(false);
  });
});

describe("o remetente de verdade, com a rede substituída", () => {
  beforeEach(() => {
    envio.sendNotification.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sem as três variáveis, nem tenta enviar", async () => {
    configurar("", "", "");
    const enviar = await remetente();

    expect(await enviar(ALVO, PAYLOAD)).toEqual({
      status: "failed",
      errorCode: "vapid_missing",
    });
    expect(envio.sendNotification).not.toHaveBeenCalled();
  });

  it("par trocado é recusado antes da rede, com o código que diz o que é", async () => {
    const a = await parVapid();
    const b = await parVapid();
    configurar(a.publicKey, b.privateKey, "mailto:fixture@date.invalid");
    const enviar = await remetente();

    expect(await enviar(ALVO, PAYLOAD)).toEqual({
      status: "failed",
      errorCode: "vapid_mismatch",
    });
    expect(envio.sendNotification).not.toHaveBeenCalled();
  });

  it("chave ou subject fora do formato viram vapid_invalid", async () => {
    const par = await parVapid();

    configurar("nao-e-chave", par.privateKey, "mailto:fixture@date.invalid");
    expect(await (await remetente())(ALVO, PAYLOAD)).toMatchObject({
      errorCode: "vapid_invalid",
    });

    configurar(par.publicKey, par.privateKey, "fixture@date.invalid");
    expect(await (await remetente())(ALVO, PAYLOAD)).toMatchObject({
      errorCode: "vapid_invalid",
    });

    expect(envio.sendNotification).not.toHaveBeenCalled();
  });

  it("envia com TTL, teto de espera e urgência alta, e 201 é entrega", async () => {
    const par = await parVapid();
    configurar(par.publicKey, par.privateKey, "mailto:fixture@date.invalid");
    envio.sendNotification.mockResolvedValue({
      statusCode: 201,
      body: "",
      headers: {},
    });
    const enviar = await remetente();

    expect(await enviar(ALVO, PAYLOAD)).toEqual({
      status: "sent",
      statusCode: 201,
    });
    expect(envio.sendNotification).toHaveBeenCalledWith(
      {
        endpoint: ALVO.endpoint,
        keys: { p256dh: ALVO.p256dh, auth: ALVO.auth },
      },
      JSON.stringify(PAYLOAD),
      /* `urgency: "high"` é o que faz o FCM acordar um Android em repouso
         (D-182). Sem ele, o envio sai com 201 e fica retido no aparelho. */
      { TTL: 43_200, timeout: 10_000, urgency: "high" },
    );

    /* E as mesmas opções, pela biblioteca de verdade, viram os headers que o
       push service lê. */
    const [, corpo, opcoes] = envio.sendNotification.mock.calls[0]!;
    const requisicao = await montarRequisicao(
      { endpoint: ALVO.endpoint, keys: chavesDeNavegador() },
      corpo,
      opcoes,
    );
    expect(requisicao.headers).toMatchObject({ Urgency: "high", TTL: 43_200 });
    expect(requisicao.headers.Authorization).toMatch(/^vapid t=.+, k=.+$/);
  });

  it("a recusa chega com o motivo do push service", async () => {
    const par = await parVapid();
    configurar(par.publicKey, par.privateKey, "mailto:fixture@date.invalid");
    envio.sendNotification.mockRejectedValue(
      recusa(403, '{"reason":"BadJwtToken"}'),
    );
    const enviar = await remetente();

    expect(await enviar(ALVO, PAYLOAD)).toEqual({
      status: "failed",
      statusCode: 403,
      errorCode: "http_403:BadJwtToken",
    });
  });

  it("410 continua desativando, e erro sem status é rede", async () => {
    const par = await parVapid();
    configurar(par.publicKey, par.privateKey, "mailto:fixture@date.invalid");
    const enviar = await remetente();

    envio.sendNotification.mockRejectedValueOnce(recusa(410, ""));
    expect(await enviar(ALVO, PAYLOAD)).toEqual({
      status: "stale",
      statusCode: 410,
    });

    envio.sendNotification.mockRejectedValueOnce(new Error("Socket timeout"));
    expect(await enviar(ALVO, PAYLOAD)).toEqual({
      status: "failed",
      errorCode: "network",
    });
  });
});

describe("o que o teste do Perfil diz à pessoa", () => {
  it("separa servidor de aparelho", () => {
    expect(testPushStateFor({ status: "sent", statusCode: 201 })).toEqual({
      ok: true,
    });

    expect(testPushStateFor({ status: "stale", statusCode: 410 })).toEqual({
      ok: false,
      motivo: "expirada",
      codigo: "http_410",
    });

    /* Configuração do servidor: nada no aparelho resolve. */
    for (const errorCode of [
      "vapid_missing",
      "vapid_invalid",
      "vapid_mismatch",
    ]) {
      expect(testPushStateFor({ status: "failed", errorCode })).toMatchObject({
        motivo: "servidor",
        codigo: errorCode,
      });
    }

    expect(
      testPushStateFor({
        status: "failed",
        statusCode: 403,
        errorCode: "http_403:BadJwtToken",
      }),
    ).toEqual({
      ok: false,
      motivo: "recusada",
      codigo: "http_403:BadJwtToken",
    });

    for (const resultado of [
      { status: "failed" as const, statusCode: 429, errorCode: "rate_limited" },
      { status: "failed" as const, statusCode: 503, errorCode: "http_503" },
      { status: "failed" as const, errorCode: "network" },
    ]) {
      expect(testPushStateFor(resultado)).toMatchObject({
        motivo: "indisponivel",
      });
    }
  });
});

describe("a chave da inscrição, do lado do navegador", () => {
  it("decodifica a pública no ponto de 65 bytes que o subscribe espera", async () => {
    const par = await parVapid();
    const bytes = new Uint8Array(applicationServerKeyBytes(par.publicKey));

    expect(bytes).toHaveLength(65);
    /* 0x04: ponto não comprimido de P-256. */
    expect(bytes[0]).toBe(0x04);
    expect(
      Buffer.from(bytes).equals(Buffer.from(par.publicKey, "base64url")),
    ).toBe(true);
  });

  it("só troca a inscrição quando sabe que a chave é outra", async () => {
    const atual = applicationServerKeyBytes((await parVapid()).publicKey);
    const antiga = applicationServerKeyBytes((await parVapid()).publicKey);

    const com = (applicationServerKey: ArrayBuffer | null) => ({
      options: { applicationServerKey, userVisibleOnly: true },
    });

    expect(isSubscribedWithOtherKey(com(atual), atual)).toBe(false);
    expect(isSubscribedWithOtherKey(com(antiga), atual)).toBe(true);

    /* Sem a informação, nada de reinscrever: o custo seria uma troca de
       endpoint a cada visita ao Perfil. */
    expect(isSubscribedWithOtherKey(com(null), atual)).toBe(false);
    expect(
      isSubscribedWithOtherKey({} as Pick<PushSubscription, "options">, atual),
    ).toBe(false);
  });
});
