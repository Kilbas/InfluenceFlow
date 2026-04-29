import { auth } from "@/lib/auth";
import { listContactsForUser } from "@/server/contacts";
import Link from "next/link";

export default async function ContactsPage() {
  const session = (await auth())!;
  const contacts = await listContactsForUser({
    workspaceId: session.user.workspaceId,
    userId: session.user.id,
    role: session.user.role,
  });
  const isAdmin = session.user.role !== "member";

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Contacts ({contacts.length})</h1>
        <Link href="/contacts/import" className="rounded bg-black px-3 py-1 text-sm text-white">
          Import Excel
        </Link>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead className="border-b bg-gray-50 text-left">
          <tr>
            <th className="p-2">Active</th>
            <th className="p-2">Name</th>
            <th className="p-2">Email</th>
            <th className="p-2">Instagram</th>
            <th className="p-2">Niche</th>
            <th className="p-2">Country</th>
            <th className="p-2">Followers</th>
            {isAdmin && <th className="p-2">Owner</th>}
          </tr>
        </thead>
        <tbody>
          {contacts.map((c) => (
            <tr key={c.id} className="border-b">
              <td className="p-2">
                <input type="checkbox" checked={c.agentActive} readOnly />
              </td>
              <td className="p-2">
                <Link className="underline" href={`/contacts/${c.id}`}>
                  {c.displayName}
                </Link>
              </td>
              <td className="p-2">{c.email}</td>
              <td className="p-2">{c.instagramHandle ?? "—"}</td>
              <td className="p-2">{c.niche ?? "—"}</td>
              <td className="p-2">{c.country ?? "—"}</td>
              <td className="p-2">{c.followersCount ?? "—"}</td>
              {isAdmin && <td className="p-2">{c.owner.displayName}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
