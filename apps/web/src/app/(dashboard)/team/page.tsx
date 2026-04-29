import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { listWorkspaceUsers } from "@/server/users";
import { listInvitations } from "@/server/invitations";
import { InviteForm } from "./InviteForm";
import { revokeAction, changeRoleAction, deactivateAction } from "./actions";

export default async function TeamPage() {
  const session = (await auth())!;
  if (session.user.role === "member") redirect("/contacts");

  const users = await listWorkspaceUsers({
    workspaceId: session.user.workspaceId,
    actor: { role: session.user.role },
  });
  const invitations = await listInvitations({
    workspaceId: session.user.workspaceId,
    actor: { role: session.user.role },
  });

  return (
    <div className="space-y-8">
      <section>
        <h1 className="mb-4 text-xl font-semibold">Invite a teammate</h1>
        <InviteForm />
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Pending invitations</h2>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left">Email</th>
              <th className="p-2 text-left">Role</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Created</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {invitations.map((inv) => {
              const status = inv.acceptedAt
                ? "accepted"
                : inv.expiresAt && inv.expiresAt < new Date()
                ? "expired"
                : "pending";
              const revokeFor = revokeAction.bind(null, inv.id);
              return (
                <tr key={inv.id} className="border-b">
                  <td className="p-2">{inv.email}</td>
                  <td className="p-2">{inv.role}</td>
                  <td className="p-2">{status}</td>
                  <td className="p-2">{inv.createdAt.toISOString().slice(0, 10)}</td>
                  <td className="p-2">
                    {status === "pending" && (
                      <form action={revokeFor}>
                        <button className="text-red-600">Revoke</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Team members</h2>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left">Name</th>
              <th className="p-2 text-left">Email</th>
              <th className="p-2 text-left">Role</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const newRole = u.role === "admin" ? "member" : "admin";
              const changeRole = changeRoleAction.bind(null, u.id, newRole as "admin" | "member");
              const deactivate = deactivateAction.bind(null, u.id);
              return (
                <tr key={u.id} className="border-b">
                  <td className="p-2">{u.displayName}</td>
                  <td className="p-2">{u.email}</td>
                  <td className="p-2">{u.role}</td>
                  <td className="p-2">{u.deletedAt ? "deactivated" : "active"}</td>
                  <td className="p-2 space-x-2">
                    {u.role !== "owner" && !u.deletedAt && (
                      <>
                        <form action={changeRole} className="inline">
                          <button className="underline">
                            Make {newRole}
                          </button>
                        </form>
                        <form action={deactivate} className="inline">
                          <button className="text-red-600">Deactivate</button>
                        </form>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
