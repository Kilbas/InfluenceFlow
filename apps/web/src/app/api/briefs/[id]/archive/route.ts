import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { archiveBrief, BriefForbiddenError } from "@/server/briefs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const brief = await archiveBrief(
      { workspaceId: session.user.workspaceId, userId: session.user.id, role: session.user.role },
      id
    );
    if (!brief) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ brief });
  } catch (e) {
    if (e instanceof BriefForbiddenError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    console.error("[POST /api/briefs/:id/archive]", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
