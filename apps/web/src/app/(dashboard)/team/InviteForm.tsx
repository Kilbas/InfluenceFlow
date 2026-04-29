"use client";
import { useState } from "react";
import { inviteAction } from "./actions";

export function InviteForm() {
  const [link, setLink] = useState<string | null>(null);

  return (
    <form
      action={async (fd) => {
        const r = await inviteAction(fd);
        if (r?.token) setLink(`${location.origin}/invite/${r.token}`);
      }}
      className="mb-6 grid grid-cols-4 gap-2"
    >
      <input name="email" required placeholder="email" className="rounded border p-2" />
      <select name="role" className="rounded border p-2">
        <option value="member">member</option>
        <option value="admin">admin</option>
      </select>
      <input
        name="expiryDays"
        type="number"
        defaultValue={30}
        className="rounded border p-2"
      />
      <label className="flex items-center gap-2">
        <input type="checkbox" name="noExpiry" /> no expiry
      </label>
      <button className="col-span-4 rounded bg-black px-3 py-2 text-white">
        Generate invitation link
      </button>
      {link && (
        <div className="col-span-4 rounded bg-green-50 p-2 text-sm">
          <div className="mb-1">Send this link to the new user:</div>
          <code className="block break-all">{link}</code>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(link)}
            className="mt-2 rounded border px-2 py-1 text-xs"
          >
            Copy
          </button>
        </div>
      )}
    </form>
  );
}
