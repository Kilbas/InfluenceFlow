// All known audit event action strings.
// Phase 1 server modules use these as inline literals; Phase 2+ should import from here.

// Phase 1
export const AUDIT_AUTH_LOGIN = "auth.login";
export const AUDIT_AUTH_FAILED_LOGIN = "auth.failed_login";
export const AUDIT_USER_INVITED = "user.invited";
export const AUDIT_USER_JOINED = "user.joined";
export const AUDIT_USER_INVITATION_REVOKED = "user.invitation_revoked";
export const AUDIT_USER_ROLE_CHANGED = "user.role_changed";
export const AUDIT_USER_DEACTIVATED = "user.deactivated";
export const AUDIT_CONTACT_UPDATED = "contact.updated";
export const AUDIT_CONTACT_DELETED = "contact.deleted";
export const AUDIT_CONTACT_AGENT_TOGGLED = "contact.agent_active.toggled";
export const AUDIT_CONTACT_AGENT_BLOCKED = "contact.agent_active.activation_blocked";
export const AUDIT_IMPORT_COMPLETED = "import.completed";

// Phase 2
export const AUDIT_BRIEF_CREATED = "brief.created";
export const AUDIT_BRIEF_UPDATED = "brief.updated";
export const AUDIT_BRIEF_ARCHIVED = "brief.archived";
export const AUDIT_MEMBER_SMTP_CONFIGURED = "member_smtp.configured";
export const AUDIT_MEMBER_SMTP_TESTED = "member_smtp.tested";
export const AUDIT_LETTER_GENERATED = "letter.generated";
export const AUDIT_LETTER_APPROVED = "letter.approved";
export const AUDIT_LETTER_REJECTED = "letter.rejected";
export const AUDIT_LETTER_EDITED = "letter.edited";
export const AUDIT_LETTER_REFINED = "letter.refined";
export const AUDIT_EMAIL_SENT = "email.sent";
export const AUDIT_EMAIL_SEND_FAILED = "email.send_failed";
export const AUDIT_EMAIL_OPENED = "email.opened";
export const AUDIT_BUCKET_CHANGED_MANUALLY = "bucket.changed_manually";
export const AUDIT_WORKSPACE_SETTINGS_UPDATED = "workspace_settings.updated";
