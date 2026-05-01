import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { BriefValidationError, createBrief, listBriefs } from "@/server/briefs";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const archivedParam = req.nextUrl.searchParams.get("archived");
  const archived =
    archivedParam === "true" ? true : archivedParam === "false" ? false : undefined;

  const briefs = await listBriefs(
    { workspaceId: session.user.workspaceId, userId: session.user.id, role: session.user.role },
    { archived }
  );
  return NextResponse.json({ briefs });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const brief = await createBrief(
      { workspaceId: session.user.workspaceId, userId: session.user.id, role: session.user.role },
      body
    );
    return NextResponse.json({ brief }, { status: 201 });
  } catch (e) {
    if (e instanceof BriefValidationError) {
      return NextResponse.json({ error: e.message, field: e.field }, { status: 400 });
    }
    console.error("[POST /api/briefs]", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
