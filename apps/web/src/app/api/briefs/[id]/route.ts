import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  BriefForbiddenError,
  BriefValidationError,
  getBriefById,
  updateBrief,
} from "@/server/briefs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const brief = await getBriefById(
    { workspaceId: session.user.workspaceId, userId: session.user.id, role: session.user.role },
    id
  );
  if (!brief) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ brief });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const brief = await updateBrief(
      { workspaceId: session.user.workspaceId, userId: session.user.id, role: session.user.role },
      id,
      body
    );
    if (!brief) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ brief });
  } catch (e) {
    if (e instanceof BriefForbiddenError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (e instanceof BriefValidationError) {
      return NextResponse.json({ error: e.message, field: e.field }, { status: 400 });
    }
    console.error("[PATCH /api/briefs/:id]", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
