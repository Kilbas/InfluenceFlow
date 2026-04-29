import { prisma } from "@/lib/db";
import { AcceptForm } from "./AcceptForm";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await prisma.invitation.findUnique({
    where: { token },
    include: { workspace: { select: { name: true } } },
  });

  if (!inv) {
    return <main className="p-8">Invitation not found.</main>;
  }
  if (inv.acceptedAt) {
    return <main className="p-8">This invitation has already been used.</main>;
  }
  if (inv.expiresAt && inv.expiresAt < new Date()) {
    return <main className="p-8">This invitation has expired.</main>;
  }

  return (
    <main className="mx-auto mt-20 max-w-sm p-6">
      <h1 className="mb-2 text-2xl font-semibold">Join {inv.workspace.name}</h1>
      <p className="mb-6 text-sm text-gray-500">Invited as {inv.role} ({inv.email})</p>
      <AcceptForm token={token} />
    </main>
  );
}
