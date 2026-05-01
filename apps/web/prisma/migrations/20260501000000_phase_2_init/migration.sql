-- CreateEnum
CREATE TYPE "Bucket" AS ENUM ('cold', 'first_sent', 'replied', 'quoted_price', 'agreed', 'rejected', 'no_reply_email', 'no_reply', 'archived');

-- CreateEnum
CREATE TYPE "ToneOfVoice" AS ENUM ('friendly', 'casual', 'professional', 'playful');

-- CreateEnum
CREATE TYPE "SentEmailStatus" AS ENUM ('queued', 'generating', 'awaiting_review', 'approved', 'sending', 'sent', 'generation_failed', 'send_failed', 'rejected');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "approved_letters_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "force_preview_mode" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "bucket" "Bucket" NOT NULL DEFAULT 'cold';

-- CreateTable
CREATE TABLE "briefs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "product_description" TEXT NOT NULL,
    "audience_overlap" TEXT NOT NULL,
    "why_work_with_us" TEXT NOT NULL,
    "key_product_benefits" TEXT NOT NULL,
    "accepts_barter" BOOLEAN NOT NULL DEFAULT true,
    "barter_offer" TEXT,
    "accepts_paid" BOOLEAN NOT NULL DEFAULT false,
    "paid_budget_range" TEXT,
    "desired_format" TEXT NOT NULL,
    "tone_of_voice" "ToneOfVoice" NOT NULL DEFAULT 'friendly',
    "letter_language" TEXT NOT NULL DEFAULT 'auto',
    "sender_role" TEXT NOT NULL,
    "forbidden_phrases" TEXT[],
    "no_price_first_email" BOOLEAN NOT NULL DEFAULT true,
    "landing_url" TEXT,
    "promo_code" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "briefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_smtp" (
    "user_id" UUID NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "password_encrypted" TEXT NOT NULL,
    "sender_name" TEXT NOT NULL,
    "sender_email" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "tested_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_smtp_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "web_context" (
    "id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "summary" TEXT,
    "raw_search_results" JSONB NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "web_context_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sent_emails" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "sender_user_id" UUID NOT NULL,
    "brief_id" UUID NOT NULL,
    "model_used" TEXT,
    "subject" TEXT,
    "body_text" TEXT,
    "body_html" TEXT,
    "status" "SentEmailStatus" NOT NULL DEFAULT 'queued',
    "generated_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "edited_by_user_id" UUID,
    "smtp_message_id" TEXT,
    "sequence_step" INTEGER,
    "tracking_pixel_id" UUID NOT NULL,
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sent_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_open_events" (
    "id" UUID NOT NULL,
    "sent_email_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_open_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_settings" (
    "workspace_id" UUID NOT NULL,
    "letter_model" TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
    "summarize_model" TEXT NOT NULL DEFAULT 'claude-haiku-4-5',
    "tracking_enabled" BOOLEAN NOT NULL DEFAULT true,
    "rate_limit_per_member" INTEGER NOT NULL DEFAULT 50,
    "calibration_threshold" INTEGER NOT NULL DEFAULT 100,
    "default_brief_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_settings_pkey" PRIMARY KEY ("workspace_id")
);

-- CreateIndex
CREATE INDEX "briefs_workspace_id_archived_idx" ON "briefs"("workspace_id", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "web_context_contact_id_key" ON "web_context"("contact_id");

-- CreateIndex
CREATE INDEX "web_context_expires_at_idx" ON "web_context"("expires_at");

-- CreateIndex
CREATE INDEX "sent_emails_workspace_id_status_idx" ON "sent_emails"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "sent_emails_sender_user_id_status_idx" ON "sent_emails"("sender_user_id", "status");

-- CreateIndex
CREATE INDEX "sent_emails_tracking_pixel_id_idx" ON "sent_emails"("tracking_pixel_id");

-- CreateIndex
CREATE INDEX "email_open_events_sent_email_id_opened_at_idx" ON "email_open_events"("sent_email_id", "opened_at");

-- CreateIndex
CREATE INDEX "contacts_workspace_id_bucket_idx" ON "contacts"("workspace_id", "bucket");

-- AddForeignKey
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_smtp" ADD CONSTRAINT "member_smtp_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_context" ADD CONSTRAINT "web_context_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_context" ADD CONSTRAINT "web_context_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sent_emails" ADD CONSTRAINT "sent_emails_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sent_emails" ADD CONSTRAINT "sent_emails_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sent_emails" ADD CONSTRAINT "sent_emails_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sent_emails" ADD CONSTRAINT "sent_emails_brief_id_fkey" FOREIGN KEY ("brief_id") REFERENCES "briefs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_open_events" ADD CONSTRAINT "email_open_events_sent_email_id_fkey" FOREIGN KEY ("sent_email_id") REFERENCES "sent_emails"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

