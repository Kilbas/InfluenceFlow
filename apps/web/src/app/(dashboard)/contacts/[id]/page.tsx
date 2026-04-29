import { auth } from "@/lib/auth";
import { getContactForUser } from "@/server/contacts";
import { notFound } from "next/navigation";
import { EditForm } from "./EditForm";

export default async function ContactDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = (await auth())!;
  const contact = await getContactForUser({
    workspaceId: session.user.workspaceId,
    userId: session.user.id,
    role: session.user.role,
    contactId: id,
  });
  if (!contact) notFound();

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">{contact.displayName}</h1>
      <p className="mb-4 text-sm text-gray-500">
        {contact.email} · {contact.instagramHandle ?? "no instagram"}
      </p>
      <EditForm contact={contact} />
    </div>
  );
}
