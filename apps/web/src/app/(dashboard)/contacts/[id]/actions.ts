"use server";
import { auth } from "@/lib/auth";
import { updateContact, softDeleteContact } from "@/server/contacts";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function saveContact(id: string, formData: FormData) {
  const session = (await auth())!;
  const patch: Partial<{
    displayName: string;
    language: string | null;
    country: string | null;
    niche: string | null;
    notes: string | null;
    phone: string | null;
    youtubeChannelName: string | null;
    followersCount: number | null;
  }> = {};
  for (const k of [
    "displayName",
    "language",
    "country",
    "niche",
    "notes",
    "phone",
    "youtubeChannelName",
  ] as const) {
    const v = formData.get(k);
    if (typeof v === "string") {
      const trimmed = v.trim() || null;
      if (k === "displayName") {
        if (trimmed) patch[k] = trimmed;
      } else {
        patch[k] = trimmed;
      }
    }
  }
  const fc = formData.get("followersCount");
  if (typeof fc === "string") patch.followersCount = fc.trim() ? Number(fc) : null;

  await updateContact(
    {
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      role: session.user.role,
      contactId: id,
    },
    patch
  );
  revalidatePath(`/contacts/${id}`);
}

export async function deleteContact(id: string) {
  const session = (await auth())!;
  await softDeleteContact({
    workspaceId: session.user.workspaceId,
    userId: session.user.id,
    role: session.user.role,
    contactId: id,
  });
  redirect("/contacts");
}
