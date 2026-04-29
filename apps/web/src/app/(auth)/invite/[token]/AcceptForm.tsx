"use client";
import { useState } from "react";
import { acceptAction } from "./actions";

export function AcceptForm({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={async (fd) => {
        setError(null);
        const result = await acceptAction(token, fd);
        if (result?.error) setError(result.error);
      }}
      className="space-y-3"
    >
      <input name="displayName" required placeholder="Your name" className="w-full rounded border p-2" />
      <input name="password" type="password" required placeholder="Password" className="w-full rounded border p-2" />
      <input name="confirm" type="password" required placeholder="Confirm password" className="w-full rounded border p-2" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="w-full rounded bg-black px-4 py-2 text-white">Create account</button>
    </form>
  );
}
