import { auth } from "@/lib/auth";
import { listBriefs } from "@/server/briefs";
import Link from "next/link";

export default async function BriefsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const session = (await auth())!;
  const params = await searchParams;
  const showArchived = params.archived === "true";

  const briefs = await listBriefs(
    {
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      role: session.user.role,
    },
    { archived: showArchived }
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          Briefs ({briefs.length})
        </h1>
        <Link
          href="/briefs/new"
          className="rounded bg-black px-3 py-1 text-sm text-white"
        >
          New brief
        </Link>
      </div>

      <div className="mb-3 flex gap-3 text-sm">
        <Link
          className={!showArchived ? "font-semibold underline" : "text-gray-500"}
          href="/briefs"
        >
          Active
        </Link>
        <Link
          className={showArchived ? "font-semibold underline" : "text-gray-500"}
          href="/briefs?archived=true"
        >
          Archived
        </Link>
      </div>

      {briefs.length === 0 ? (
        <p className="text-sm text-gray-500">No briefs yet.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead className="border-b bg-gray-50 text-left">
            <tr>
              <th className="p-2">Name</th>
              <th className="p-2">Creator</th>
              <th className="p-2">Created</th>
              <th className="p-2">Status</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {briefs.map((b) => (
              <tr key={b.id} className="border-b">
                <td className="p-2">
                  <Link className="underline" href={`/briefs/${b.id}`}>
                    {b.name}
                  </Link>
                </td>
                <td className="p-2">{b.createdBy.displayName}</td>
                <td className="p-2">
                  {new Date(b.createdAt).toLocaleDateString()}
                </td>
                <td className="p-2">
                  {b.archived ? (
                    <span className="rounded bg-gray-200 px-1 text-xs">
                      archived
                    </span>
                  ) : (
                    <span className="rounded bg-green-100 px-1 text-xs">
                      active
                    </span>
                  )}
                </td>
                <td className="p-2">
                  <Link className="underline" href={`/briefs/${b.id}`}>
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
