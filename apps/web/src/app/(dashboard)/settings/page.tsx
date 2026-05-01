import { auth } from "@/lib/auth";
import { listBriefs } from "@/server/briefs";
import { getOrCreateSettings } from "@/server/workspace-settings";
import { SettingsForm } from "./SettingsForm";

export default async function SettingsPage() {
  const session = (await auth())!;
  const ctx = {
    workspaceId: session.user.workspaceId,
    userId: session.user.id,
    role: session.user.role,
  };
  const isAdmin = session.user.role === "admin" || session.user.role === "owner";
  // Members may load the page in read-only mode per spec §13.1; the API
  // layer is the authoritative gate for mutations.

  const [settings, briefs] = await Promise.all([
    getOrCreateSettings(ctx),
    listBriefs(ctx, { archived: false }),
  ]);

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">Workspace settings</h1>
      <SettingsForm
        initial={{
          letterModel: settings.letterModel,
          summarizeModel: settings.summarizeModel,
          trackingEnabled: settings.trackingEnabled,
          rateLimitPerMember: settings.rateLimitPerMember,
          calibrationThreshold: settings.calibrationThreshold,
          defaultBriefId: settings.defaultBriefId,
        }}
        canEdit={isAdmin}
        briefs={briefs.map((b) => ({ id: b.id, name: b.name }))}
      />
    </div>
  );
}
