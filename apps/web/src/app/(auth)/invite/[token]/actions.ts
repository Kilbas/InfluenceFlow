"use server";
import { acceptInvitation } from "@/server/invitations";
import { signIn } from "@/lib/auth";

export async function acceptAction(token: string, formData: FormData) {
  const displayName = String(formData.get("displayName")).trim();
  const password = String(formData.get("password"));
  const confirm = String(formData.get("confirm"));
  if (password !== confirm) return { error: "Passwords do not match" };
  if (password.length < 8) return { error: "Password must be at least 8 characters" };

  const user = await acceptInvitation({ token, displayName, password });
  await signIn("credentials", {
    email: user.email,
    password,
    redirectTo: "/contacts",
  });
}
