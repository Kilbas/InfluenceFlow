"use server";
import { signIn } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function loginAction(formData: FormData) {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Invalid form" };

  try {
    await signIn("credentials", { ...parsed.data, redirectTo: "/contacts" });
  } catch (e: any) {
    if (e?.type === "CredentialsSignin") return { error: "Invalid email or password" };
    throw e;
  }
}
