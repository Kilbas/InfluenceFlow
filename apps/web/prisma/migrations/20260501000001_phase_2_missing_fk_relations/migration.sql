-- AddForeignKey: sent_emails.edited_by_user_id -> users.id
ALTER TABLE "sent_emails" ADD CONSTRAINT "sent_emails_edited_by_user_id_fkey" FOREIGN KEY ("edited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: workspace_settings.default_brief_id -> briefs.id
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_default_brief_id_fkey" FOREIGN KEY ("default_brief_id") REFERENCES "briefs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
