import { describe, expect, it } from "vitest";

import {
  ObjectKeyError,
  assertKeyBelongsToWorkspace,
  buildObjectKeys,
  isWellFormedObjectKey,
} from "@/features/media/r2/object-key";

const WORKSPACE_A = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_B = "33333333-3333-4333-8333-333333333333";
const PLANO = "22222222-2222-4222-8222-222222222222";
const UPLOAD = "44444444-4444-4444-8444-444444444444";

describe("buildObjectKeys", () => {
  it("põe o workspace no começo da chave", () => {
    const keys = buildObjectKeys({
      workspaceId: WORKSPACE_A,
      planId: PLANO,
      mediaUuid: UPLOAD,
    });

    expect(keys.full).toBe(`${WORKSPACE_A}/${PLANO}/${UPLOAD}/full.webp`);
    expect(keys.thumb).toBe(`${WORKSPACE_A}/${PLANO}/${UPLOAD}/thumb.webp`);
  });

  it("recusa qualquer segmento que não seja uuid", () => {
    for (const ruim of [
      "../etc",
      "",
      "não-é-uuid",
      `${WORKSPACE_A}/extra`,
      "11111111-1111-4111-8111-11111111111",
    ]) {
      expect(() =>
        buildObjectKeys({
          workspaceId: ruim,
          planId: PLANO,
          mediaUuid: UPLOAD,
        }),
      ).toThrow(ObjectKeyError);
    }
  });

  it("não deixa o plano carregar travessia de caminho", () => {
    expect(() =>
      buildObjectKeys({
        workspaceId: WORKSPACE_A,
        planId: "../../outro-workspace",
        mediaUuid: UPLOAD,
      }),
    ).toThrow(ObjectKeyError);
  });
});

describe("isWellFormedObjectKey", () => {
  it("aceita só as duas formas que o servidor gera", () => {
    expect(
      isWellFormedObjectKey(`${WORKSPACE_A}/${PLANO}/${UPLOAD}/full.webp`),
    ).toBe(true);
    expect(
      isWellFormedObjectKey(`${WORKSPACE_A}/${PLANO}/${UPLOAD}/thumb.webp`),
    ).toBe(true);
  });

  it("recusa o resto", () => {
    for (const ruim of [
      `${WORKSPACE_A}/${PLANO}/${UPLOAD}/original.jpg`,
      `${WORKSPACE_A}/${PLANO}/${UPLOAD}/full.webp/../../x`,
      `${WORKSPACE_A}/${PLANO}/full.webp`,
      `/${WORKSPACE_A}/${PLANO}/${UPLOAD}/full.webp`,
      "full.webp",
      "",
    ]) {
      expect(isWellFormedObjectKey(ruim)).toBe(false);
    }
  });
});

describe("assertKeyBelongsToWorkspace", () => {
  it("deixa passar a chave do próprio workspace", () => {
    const key = `${WORKSPACE_A}/${PLANO}/${UPLOAD}/full.webp`;
    expect(assertKeyBelongsToWorkspace(key, WORKSPACE_A)).toBe(key);
  });

  it("barra a chave de outro workspace", () => {
    expect(() =>
      assertKeyBelongsToWorkspace(
        `${WORKSPACE_B}/${PLANO}/${UPLOAD}/full.webp`,
        WORKSPACE_A,
      ),
    ).toThrow(/fora do workspace/);
  });

  it("barra chave malformada antes de olhar o prefixo", () => {
    expect(() =>
      assertKeyBelongsToWorkspace(`${WORKSPACE_A}/qualquer/coisa`, WORKSPACE_A),
    ).toThrow(/fora do formato/);
  });
});
