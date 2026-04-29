import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { activateAgent, deactivateAgent } from "@/server/agent-flag";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json()) as { active: boolean };
  try {
    if (body.active) {
      const r = await activateAgent({
        workspaceId: session.user.workspaceId,
        actor: { id: session.user.id, role: session.user.role },
        contactId: id,
      });
      if (!r.ok) return NextResponse.json({ blockedBy: r.blockedBy }, { status: 409 });
    } else {
      await deactivateAgent({
        workspaceId: session.user.workspaceId,
        actor: { id: session.user.id, role: session.user.role },
        contactId: id,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
