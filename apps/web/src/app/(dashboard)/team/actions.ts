"use server";
import { auth } from "@/lib/auth";
import { createInvitation, revokeInvitation } from "@/server/invitations";
import { changeUserRole, deactivateUser } from "@/server/users";
import { revalidatePath } from "next/cache";

export async function inviteAction(formData: FormData) {
  const session = (await auth())!;
  const email = String(formData.get("email"));
  const role = formData.get("role") === "admin" ? "admin" : "member";
  const noExpiry = formData.get("noExpiry") === "on";
  const expiryDays = noExpiry ? null : Number(formData.get("expiryDays") ?? 30);

  const inv = await createInvitation({
    workspaceId: session.user.workspaceId,
    actor: { id: session.user.id, role: session.user.role },
    email,
    role,
    expiryDays,
  });

  revalidatePath("/team");
  return { token: inv.token };
}

export async function revokeAction(invitationId: string) {
  const session = (await auth())!;
  await revokeInvitation({
    workspaceId: session.user.workspaceId,
    actor: { id: session.user.id, role: session.user.role },
    invitationId,
  });
  revalidatePath("/team");
}

export async function changeRoleAction(userId: string, newRole: "admin" | "member") {
  const session = (await auth())!;
  await changeUserRole({
    workspaceId: session.user.workspaceId,
    actor: { role: session.user.role },
    userId,
    newRole,
  });
  revalidatePath("/team");
}

export async function deactivateAction(userId: string) {
  const session = (await auth())!;
  await deactivateUser({
    workspaceId: session.user.workspaceId,
    actor: { role: session.user.role },
    userId,
  });
  revalidatePath("/team");
}
