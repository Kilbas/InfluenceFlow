import { auth } from "@/lib/auth";
import {
  getProfileForUser,
  getTodaySendCount,
} from "@/server/profile";
import { getMemberSmtpForUser } from "@/server/smtp-config";
import { getOrCreateSettings } from "@/server/workspace-settings";
import { ProfileForms } from "./ProfileForms";

export default async function ProfilePage() {
  const session = (await auth())!;
  const [user, smtp, settings, todayCount] = await Promise.all([
    getProfileForUser(session.user.id),
    getMemberSmtpForUser(session.user.id),
    getOrCreateSettings({
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      role: session.user.role,
    }),
    getTodaySendCount(session.user.id),
  ]);
  if (!user) return <div>User not found.</div>;

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">Profile</h1>
      <ProfileForms
        user={{
          email: user.email,
          displayName: user.displayName,
          approvedLettersCount: user.approvedLettersCount,
          forcePreviewMode: user.forcePreviewMode,
        }}
        smtp={smtp}
        calibrationThreshold={settings.calibrationThreshold}
        rateLimitPerMember={settings.rateLimitPerMember}
        todayCount={todayCount}
      />
    </div>
  );
}
