import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getMemberSmtpForUser } from "@/server/smtp-config";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const smtp = await getMemberSmtpForUser(session.user.id);
  return NextResponse.json({ smtp });
}
