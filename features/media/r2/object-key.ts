import { MEDIA_VARIANTS, type MediaVariant } from "@/features/media/constants";

/**
 * Object key (seção 4 do docs/MEDIA_R2.md).
 *
 * ```text
 * {workspace_id}/{plan_id}/{uuid}/full.webp
 * {workspace_id}/{plan_id}/{uuid}/thumb.webp
 * ```
 *
 * Sempre gerada no servidor e nunca aceita do cliente — nem para escrever, nem
 * para ler, nem para remover. O `workspace_id` no prefixo torna colisão entre
 * workspaces impossível e deixa qualquer chave auditável a olho.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ObjectKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ObjectKeyError";
  }
}

function assertUuid(value: string, field: string): void {
  if (!UUID.test(value)) {
    throw new ObjectKeyError(`${field} não é um uuid.`);
  }
}

export type MediaObjectKeys = Readonly<Record<MediaVariant, string>>;

/**
 * O `mediaUuid` é sorteado aqui e não é o id da linha: a chave precisa existir
 * antes de a linha existir, porque o objeto sobe primeiro.
 */
export function buildObjectKeys(input: {
  workspaceId: string;
  planId: string;
  mediaUuid: string;
}): MediaObjectKeys {
  assertUuid(input.workspaceId, "workspaceId");
  assertUuid(input.planId, "planId");
  assertUuid(input.mediaUuid, "mediaUuid");

  const prefixo = `${input.workspaceId}/${input.planId}/${input.mediaUuid}`;

  return {
    full: `${prefixo}/full.webp`,
    thumb: `${prefixo}/thumb.webp`,
  };
}

const SHAPE = new RegExp(
  `^${UUID.source.slice(1, -1)}/${UUID.source.slice(1, -1)}/${UUID.source.slice(1, -1)}/(${MEDIA_VARIANTS.join("|")})\\.webp$`,
  "i",
);

export function isWellFormedObjectKey(key: string): boolean {
  return SHAPE.test(key);
}

/**
 * Última barreira antes de qualquer chamada ao R2. A chave vem da nossa linha,
 * que já foi lida com predicado de workspace — mas conferir o prefixo custa uma
 * comparação de string e transforma um eventual furo na leitura em erro em vez
 * de vazamento de foto.
 */
export function assertKeyBelongsToWorkspace(
  key: string,
  workspaceId: string,
): string {
  if (!isWellFormedObjectKey(key)) {
    throw new ObjectKeyError(
      "Object key fora do formato gerado pelo servidor.",
    );
  }

  if (!key.startsWith(`${workspaceId}/`)) {
    throw new ObjectKeyError("Object key fora do workspace do contexto.");
  }

  return key;
}
