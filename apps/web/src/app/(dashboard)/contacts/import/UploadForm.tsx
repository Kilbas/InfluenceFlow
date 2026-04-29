"use client";
import { useState } from "react";
import { uploadAction } from "./actions";

type UploadState =
  | null
  | { error: string }
  | { needsConfirm: { fileHash: string; priorAt: string } };

export function UploadForm() {
  const [state, setState] = useState<UploadState>(null);
  const [pending, setPending] = useState(false);

  async function submit(fd: FormData) {
    setPending(true);
    const r = await uploadAction(fd);
    setPending(false);
    if (r) setState(r);
  }

  return (
    <form
      action={async (fd) => {
        if (state && "needsConfirm" in state) fd.set("forceReupload", "1");
        await submit(fd);
      }}
      className="space-y-4"
    >
      <a href="/api/template" className="underline">Download template.xlsx</a>
      <input type="file" name="file" accept=".xlsx" required className="block" />
      <button disabled={pending} className="rounded bg-black px-4 py-2 text-white">
        {pending
          ? "Uploading…"
          : state && "needsConfirm" in state
          ? "Re-upload anyway"
          : "Import"}
      </button>
      {state && "error" in state && <p className="text-red-600 text-sm">{state.error}</p>}
      {state && "needsConfirm" in state && (
        <p className="text-sm text-amber-700">
          You uploaded an identical file on{" "}
          {new Date(state.needsConfirm.priorAt).toLocaleDateString()}. Click &quot;Re-upload
          anyway&quot; to import again.
        </p>
      )}
    </form>
  );
}
