import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ actor?: string; action?: string }>;
}) {
  const sp = await searchParams;
  const session = (await auth())!;
  if (session.user.role === "member") redirect("/contacts");

  const actors = await prisma.user.findMany({
    where: { workspaceId: session.user.workspaceId },
    select: { id: true, displayName: true },
  });

  const where: Prisma.AuditEventWhereInput = { workspaceId: session.user.workspaceId };
  if (sp.actor) where.actorUserId = sp.actor;
  if (sp.action) where.action = sp.action;

  const events = await prisma.auditEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actor: { select: { displayName: true } } },
  });

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Audit log</h1>
      <form className="mb-4 flex gap-2">
        <select name="actor" defaultValue={sp.actor ?? ""} className="rounded border p-1">
          <option value="">All actors</option>
          {actors.map((a) => <option key={a.id} value={a.id}>{a.displayName}</option>)}
        </select>
        <input
          name="action"
          placeholder="action filter"
          defaultValue={sp.action ?? ""}
          className="rounded border p-1"
        />
        <button className="rounded border px-3">Filter</button>
      </form>
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="p-2 text-left">When</th>
            <th className="p-2 text-left">Actor</th>
            <th className="p-2 text-left">Action</th>
            <th className="p-2 text-left">Entity</th>
            <th className="p-2 text-left">Payload</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className="border-b">
              <td className="p-2">{e.createdAt.toISOString()}</td>
              <td className="p-2">{e.actor?.displayName ?? "system"}</td>
              <td className="p-2">{e.action}</td>
              <td className="p-2">{e.entityType ?? "—"}</td>
              <td className="p-2 text-xs"><pre>{JSON.stringify(e.payload, null, 2)}</pre></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
