import { readFileSync } from "node:fs";

import { is } from "drizzle-orm";
import { getTableConfig, isPgEnum, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, expectTypeOf, it } from "vitest";

import * as schema from "@/db/schema/index.ts";
import type { PlanStatus } from "@/lib/status";

/**
 * `workspaces` é o próprio escopo e `profiles` é identidade espelhando o Neon
 * Auth (D-023): nenhuma das duas é tabela de negócio.
 */
const NOT_BUSINESS_TABLES = new Set(["workspaces", "profiles"]);

const tables = Object.values(schema).filter((value) => is(value, PgTable));
const enums = Object.values(schema).filter((value) => isPgEnum(value));

/** Lê a seção 5 do documento normativo e devolve nome do enum -> valores. */
function enumsFromDoc(): Map<string, string[]> {
  const doc = readFileSync("docs/DATABASE.md", "utf8");
  const section = doc.split("## 5. Enums")[1]?.split("\n---")[0] ?? "";
  const found = new Map<string, string[]>();

  for (const line of section.split("\n")) {
    if (!line.startsWith("- ")) continue;

    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const backticked = (text: string) =>
      [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? "");

    const names = backticked(line.slice(0, separator));
    const values = backticked(line.slice(separator + 1));

    for (const name of names) {
      found.set(name, values);
    }
  }

  return found;
}

describe("enums do schema batem com docs/DATABASE.md", () => {
  const documented = enumsFromDoc();

  it("o documento declara os nove tipos", () => {
    expect([...documented.keys()].sort()).toEqual([
      "activity_verb",
      "link_type",
      "media_purpose",
      "member_role",
      "plan_status",
      "reaction_type",
      "repeat_answer",
      "reservation_status",
      "vote_value",
    ]);
  });

  it("cada enum do código tem os valores do documento, na mesma ordem", () => {
    expect(enums.length).toBe(documented.size);

    for (const pgEnumValue of enums) {
      const expected = documented.get(pgEnumValue.enumName);
      expect(
        expected,
        `enum ${pgEnumValue.enumName} não está documentado`,
      ).toBeDefined();
      expect(
        [...pgEnumValue.enumValues],
        `valores divergentes em ${pgEnumValue.enumName}`,
      ).toEqual(expected);
    }
  });
});

describe("escopo de workspace", () => {
  it("declara as quinze tabelas da seção 4", () => {
    expect(tables.length).toBe(15);
  });

  it.each(
    tables
      .map((table) => getTableConfig(table))
      .filter((config) => !NOT_BUSINESS_TABLES.has(config.name))
      .map((config) => [config.name, config] as const),
  )(
    "%s tem workspace_id NOT NULL — sem isso a autorização vira IDOR",
    (_name, config) => {
      const column = config.columns.find((c) => c.name === "workspace_id");

      expect(column).toBeDefined();
      expect(column?.notNull).toBe(true);
    },
  );

  it("nenhuma FK aponta para fora do schema public", () => {
    for (const table of tables) {
      for (const fk of getTableConfig(table).foreignKeys) {
        const referenced = getTableConfig(fk.reference().foreignTable);
        expect(referenced.schema ?? "public").toBe("public");
      }
    }
  });
});

describe("tipos inferidos pelo Drizzle", () => {
  it("plans expõe dinheiro como número e tempo como Date", () => {
    type Plan = typeof schema.plans.$inferSelect;

    expectTypeOf<Plan["estimatedBudgetCents"]>().toEqualTypeOf<number | null>();
    expectTypeOf<Plan["createdAt"]>().toEqualTypeOf<Date>();
    expectTypeOf<Plan["archivedAt"]>().toEqualTypeOf<Date | null>();
    expectTypeOf<Plan["workspaceId"]>().toEqualTypeOf<string>();
    expect(true).toBe(true);
  });

  it("o status do plano é a mesma união usada pela interface", () => {
    type Plan = typeof schema.plans.$inferSelect;

    expectTypeOf<Plan["status"]>().toEqualTypeOf<PlanStatus>();
    expect(schema.planStatus.enumValues).toContain("deciding");
  });

  it("expenses e memory_ratings usam inteiro, não string", () => {
    type Expense = typeof schema.expenses.$inferSelect;
    type Rating = typeof schema.memoryRatings.$inferSelect;

    expectTypeOf<Expense["amountCents"]>().toEqualTypeOf<number>();
    expectTypeOf<Rating["rating"]>().toEqualTypeOf<number>();
    expect(true).toBe(true);
  });
});
