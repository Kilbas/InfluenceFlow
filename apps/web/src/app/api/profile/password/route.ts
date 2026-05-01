import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  ProfileValidationError,
  WrongPasswordError,
  changePassword,
} from "@/server/profile";

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
    await changePassword({ userId: session.user.id, patch: body });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof WrongPasswordError) {
      return NextResponse.json(
        { error: e.message, field: "currentPassword" },
        { status: 400 }
      );
    }
    if (e instanceof ProfileValidationError) {
      return NextResponse.json({ error: e.message, field: e.field }, { status: 400 });
    }
    console.error("[PATCH /api/profile/password]", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
