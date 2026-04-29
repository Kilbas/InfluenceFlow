"use client";
import type { Contact } from "@prisma/client";
import { saveContact, deleteContact } from "./actions";

export function EditForm({ contact }: { contact: Contact }) {
  return (
    <form
      action={async (fd) => {
        await saveContact(contact.id, fd);
      }}
      className="max-w-lg space-y-3"
    >
      {(
        [
          ["displayName", "Display name"],
          ["language", "Language"],
          ["country", "Country"],
          ["niche", "Niche"],
          ["followersCount", "Followers"],
          ["phone", "Phone"],
          ["youtubeChannelName", "YouTube"],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="block">
          <span className="block text-sm">{label}</span>
          <input
            name={key}
            defaultValue={contact[key] !== null && contact[key] !== undefined ? String(contact[key]) : ""}
            className="w-full rounded border p-2"
          />
        </label>
      ))}
      <label className="block">
        <span className="block text-sm">Notes</span>
        <textarea
          name="notes"
          defaultValue={contact.notes ?? ""}
          rows={4}
          className="w-full rounded border p-2"
        />
      </label>

      <div className="flex gap-2">
        <button className="rounded bg-black px-3 py-1 text-white">Save</button>
        <button
          type="button"
          onClick={() => {
            if (confirm("Delete this contact?")) {
              deleteContact(contact.id);
            }
          }}
          className="rounded border px-3 py-1 text-red-600"
        >
          Delete
        </button>
      </div>
    </form>
  );
}
