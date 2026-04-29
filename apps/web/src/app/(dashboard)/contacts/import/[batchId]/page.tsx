import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";

type RejectionRow = {
  rowNumber: number;
  reason: string;
  raw: Record<string, string>;
};

export default async function ImportReport({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  const session = (await auth())!;
  const batch = await prisma.importBatch.findFirst({
    where: { id: batchId, workspaceId: session.user.workspaceId },
  });
  if (!batch) notFound();
  if (batch.userId !== session.user.id && session.user.role === "member") notFound();

  const rejection = (batch.rejectionReport as unknown as RejectionRow[]) ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Import report — {batch.filename}</h1>
      <ul className="space-y-1 text-sm">
        <li>✅ {batch.rowsImportedNew} new contacts added</li>
        <li>🔁 {batch.rowsSkippedOwnDuplicate} rows already in your list (skipped)</li>
        <li>⚠️ {batch.rowsImportedWithColleagueWarning} rows overlap with colleagues (added with badge)</li>
        <li>❌ {batch.rowsRejected} rows rejected</li>
      </ul>

      {rejection.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Rejected rows</h2>
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(
              "row_number,reason,email,instagram,display_name\n" +
                rejection
                  .map(
                    (r) =>
                      `${r.rowNumber},${r.reason},"${r.raw.email}","${r.raw.instagram_handle_or_url}","${r.raw.display_name}"`
                  )
                  .join("\n")
            )}`}
            download={`rejection_${batch.id}.csv`}
            className="underline"
          >
            Download CSV
          </a>
        </section>
      )}

      <Link href="/contacts" className="underline">Back to contacts</Link>
    </div>
  );
}
