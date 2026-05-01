import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ProfileValidationError, updateCalibration } from "@/server/profile";

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
    const user = await updateCalibration({
      userId: session.user.id,
      patch: body,
    });
    return NextResponse.json({ user });
  } catch (e) {
    if (e instanceof ProfileValidationError) {
      return NextResponse.json({ error: e.message, field: e.field }, { status: 400 });
    }
    console.error("[PATCH /api/profile/calibration]", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
