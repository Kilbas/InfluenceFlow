"use server";
import { auth } from "@/lib/auth";
import { performImport, findPriorImportBatch } from "@/server/import";
import { createHash } from "node:crypto";
import { redirect } from "next/navigation";

export async function uploadAction(formData: FormData) {
  const session = (await auth())!;
  const file = formData.get("file") as File | null;
  if (!file) return { error: "No file uploaded" };
  if (file.size > 10 * 1024 * 1024) return { error: "File too large (10 MB max)" };

  const buf = new Uint8Array(await file.arrayBuffer());
  const fileHash = createHash("sha256").update(buf).digest("hex");

  const force = formData.get("forceReupload") === "1";
  if (!force) {
    const prior = await findPriorImportBatch({ userId: session.user.id, fileHash });
    if (prior) {
      return { needsConfirm: { fileHash, priorAt: prior.createdAt.toISOString() } };
    }
  }

  let batchId: string;
  try {
    const result = await performImport({
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      filename: file.name,
      buffer: buf,
    });
    batchId = result.batch.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Import failed" };
  }
  redirect(`/contacts/import/${batchId}`);
}
