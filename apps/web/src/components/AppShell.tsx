import Link from "next/link";
import type { Session } from "next-auth";
import { UserMenu } from "./UserMenu";

export function AppShell({
  user,
  children,
}: {
  user: Session["user"];
  children: React.ReactNode;
}) {
  const isAdmin = user.role === "admin" || user.role === "owner";
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r bg-gray-50 p-4">
        <div className="mb-6 text-lg font-semibold">InfluenceFlow</div>
        <nav className="space-y-2 text-sm">
          <Link className="block" href="/contacts">Contacts</Link>
          <Link className="block" href="/contacts/import">Import</Link>
          <Link className="block" href="/briefs">Briefs</Link>
          {isAdmin && <Link className="block" href="/team">Team</Link>}
          {isAdmin && <Link className="block" href="/settings">Settings</Link>}
          {isAdmin && <Link className="block" href="/audit">Audit log</Link>}
        </nav>
      </aside>
      <div className="flex-1">
        <header className="flex items-center justify-between border-b p-4 text-sm">
          <span className="text-gray-500">{user.role}</span>
          <UserMenu name={user.name ?? user.email ?? "User"} />
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
