import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  SettingsForbiddenError,
  SettingsValidationError,
  getOrCreateSettings,
  updateSettings,
} from "@/server/workspace-settings";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const settings = await getOrCreateSettings({
    workspaceId: session.user.workspaceId,
    userId: session.user.id,
    role: session.user.role,
  });
  return NextResponse.json({ settings });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const settings = await updateSettings(
      {
        workspaceId: session.user.workspaceId,
        userId: session.user.id,
        role: session.user.role,
      },
      body
    );
    return NextResponse.json({ settings });
  } catch (e) {
    if (e instanceof SettingsForbiddenError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (e instanceof SettingsValidationError) {
      return NextResponse.json({ error: e.message, field: e.field }, { status: 400 });
    }
    console.error("[PATCH /api/workspace/settings]", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
