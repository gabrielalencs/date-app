ALTER TABLE "memory_ratings" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
ALTER TABLE "memory_ratings" ADD COLUMN "highlight" text;--> statement-breakpoint
ALTER TABLE "memory_ratings" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "memory_ratings" ADD CONSTRAINT "memory_ratings_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
/* Backfill escrito à mão: o gerador não o produz, e sem ele o SET NOT NULL da
   0004 falharia em qualquer banco que já tenha avaliações. `memories.plan_id`
   já é NOT NULL e único, então cada avaliação recebe exatamente um plano.

   `memories.highlight` e `memories.notes` NÃO são copiados de propósito. Lá
   eles eram do plano, sem autor; aqui são da pessoa. Copiar o mesmo texto para
   as duas avaliações atribuiria a cada uma o que ela não escreveu, e escolher
   uma delas inventaria autoria do mesmo jeito. Em `development` as únicas
   linhas são as do seed, que o B9 reescreve; `production` não existe ainda. */
UPDATE "memory_ratings" AS r
   SET "plan_id" = m."plan_id"
  FROM "memories" AS m
 WHERE m."id" = r."memory_id";--> statement-breakpoint
ALTER TABLE "memories" DROP COLUMN "highlight";--> statement-breakpoint
ALTER TABLE "memories" DROP COLUMN "notes";
