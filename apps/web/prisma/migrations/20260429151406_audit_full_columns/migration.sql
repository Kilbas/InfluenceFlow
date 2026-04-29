/*
  Warnings:

  - Added the required column `action` to the `audit_events` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "audit_events" ADD COLUMN     "action" TEXT NOT NULL,
ADD COLUMN     "entity_id" UUID,
ADD COLUMN     "entity_type" TEXT,
ADD COLUMN     "payload" JSONB;

-- CreateIndex
CREATE INDEX "audit_events_workspace_id_created_at_idx" ON "audit_events"("workspace_id", "created_at" DESC);
