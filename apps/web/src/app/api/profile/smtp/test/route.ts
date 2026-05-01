import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  SmtpConnectionError,
  SmtpValidationError,
  testAndSaveMemberSmtp,
} from "@/server/smtp-config";

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
    const smtp = await testAndSaveMemberSmtp({
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      input: body,
    });
    return NextResponse.json({ smtp });
  } catch (e) {
    if (e instanceof SmtpValidationError) {
      return NextResponse.json({ error: e.message, field: e.field }, { status: 400 });
    }
    if (e instanceof SmtpConnectionError) {
      return NextResponse.json(
        { error: e.message, kind: "connection" },
        { status: 422 }
      );
    }
    console.error("[POST /api/profile/smtp/test]", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
