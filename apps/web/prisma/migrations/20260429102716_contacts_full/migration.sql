/*
  Warnings:

  - Added the required column `display_name` to the `contacts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `contacts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `file_hash` to the `import_batches` table without a default value. This is not possible if the table is not empty.
  - Added the required column `filename` to the `import_batches` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rejection_report` to the `import_batches` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rows_imported_new` to the `import_batches` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rows_imported_with_colleague_warning` to the `import_batches` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rows_rejected` to the `import_batches` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rows_skipped_own_duplicate` to the `import_batches` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rows_total` to the `import_batches` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "agent_active" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "display_name" TEXT NOT NULL,
ADD COLUMN     "followers_count" INTEGER,
ADD COLUMN     "instagram_handle" TEXT,
ADD COLUMN     "instagram_url" TEXT,
ADD COLUMN     "language" TEXT,
ADD COLUMN     "niche" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "source_import_batch_id" UUID,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "youtube_channel_name" TEXT;

-- AlterTable
ALTER TABLE "import_batches" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "file_hash" TEXT NOT NULL,
ADD COLUMN     "filename" TEXT NOT NULL,
ADD COLUMN     "rejection_report" JSONB NOT NULL,
ADD COLUMN     "rows_imported_new" INTEGER NOT NULL,
ADD COLUMN     "rows_imported_with_colleague_warning" INTEGER NOT NULL,
ADD COLUMN     "rows_rejected" INTEGER NOT NULL,
ADD COLUMN     "rows_skipped_own_duplicate" INTEGER NOT NULL,
ADD COLUMN     "rows_total" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "contacts_workspace_id_owner_user_id_agent_active_idx" ON "contacts"("workspace_id", "owner_user_id", "agent_active");

-- CreateIndex
CREATE INDEX "contacts_workspace_id_email_idx" ON "contacts"("workspace_id", "email");

-- CreateIndex
CREATE INDEX "contacts_workspace_id_instagram_handle_idx" ON "contacts"("workspace_id", "instagram_handle");

-- CreateIndex
CREATE INDEX "contacts_workspace_id_agent_active_idx" ON "contacts"("workspace_id", "agent_active");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_source_import_batch_id_fkey" FOREIGN KEY ("source_import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Partial unique index: one active contact per (workspace, owner, email)
CREATE UNIQUE INDEX "contacts_workspace_owner_email_active"
ON "contacts" ("workspace_id", "owner_user_id", "email")
WHERE "deleted_at" IS NULL;
