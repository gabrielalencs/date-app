/* Ordem corrigida à mão. O gerador emitia `DROP TABLE "memories" CASCADE`
   antes de `DROP CONSTRAINT memory_ratings_memory_id_memories_id_fk`, e o
   CASCADE já derruba essa FK — o DROP CONSTRAINT seguinte abortaria a
   migration inteira com "constraint does not exist". As dependências saem
   primeiro; a tabela, por último. */
ALTER TABLE "memory_ratings" DROP CONSTRAINT "memory_ratings_memory_profile_unique";--> statement-breakpoint
ALTER TABLE "memory_ratings" DROP CONSTRAINT "memory_ratings_memory_id_memories_id_fk";--> statement-breakpoint
DROP INDEX "memory_ratings_memory_id_idx";--> statement-breakpoint
/* Conferência antes do NOT NULL sem default: o backfill da 0003 preencheu
   `plan_id` a partir de `memories`. Se alguma linha escapou, a migration para
   aqui dizendo o porquê, em vez de devolver o erro cru do Postgres. */
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "memory_ratings" WHERE "plan_id" IS NULL) THEN
    RAISE EXCEPTION 'memory_ratings tem linha com plan_id nulo: o backfill da migration 0003 não cobriu tudo. Confira antes de seguir.';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "memory_ratings" ALTER COLUMN "plan_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_ratings" DROP COLUMN "memory_id";--> statement-breakpoint
ALTER TABLE "memory_ratings" ADD CONSTRAINT "memory_ratings_plan_profile_unique" UNIQUE("plan_id","profile_id");--> statement-breakpoint
CREATE INDEX "memory_ratings_plan_id_idx" ON "memory_ratings" USING btree ("plan_id");--> statement-breakpoint
ALTER TABLE "memories" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "memories" CASCADE;
