import { auth } from "@/lib/auth";
import { getBriefById } from "@/server/briefs";
import { notFound } from "next/navigation";
import { BriefForm } from "../BriefForm";

export default async function EditBriefPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = (await auth())!;
  const brief = await getBriefById(
    {
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      role: session.user.role,
    },
    id
  );
  if (!brief) notFound();

  const isAdmin =
    session.user.role === "admin" || session.user.role === "owner";
  const canEdit = isAdmin || brief.createdByUserId === session.user.id;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {brief.name}
          {brief.archived && (
            <span className="ml-2 rounded bg-gray-200 px-1 text-xs align-middle">
              archived
            </span>
          )}
        </h1>
        <div className="text-sm text-gray-500">
          Created by {brief.createdBy.displayName}
        </div>
      </div>
      <BriefForm
        briefId={brief.id}
        initial={{
          name: brief.name,
          productDescription: brief.productDescription,
          audienceOverlap: brief.audienceOverlap,
          whyWorkWithUs: brief.whyWorkWithUs,
          keyProductBenefits: brief.keyProductBenefits,
          desiredFormat: brief.desiredFormat,
          senderRole: brief.senderRole,
          acceptsBarter: brief.acceptsBarter,
          barterOffer: brief.barterOffer ?? "",
          acceptsPaid: brief.acceptsPaid,
          paidBudgetRange: brief.paidBudgetRange ?? "",
          toneOfVoice: brief.toneOfVoice,
          letterLanguage: brief.letterLanguage,
          forbiddenPhrases: (brief.forbiddenPhrases ?? []).join("\n"),
          noPriceFirstEmail: brief.noPriceFirstEmail,
          landingUrl: brief.landingUrl ?? "",
          promoCode: brief.promoCode ?? "",
        }}
        canEdit={canEdit}
        canArchive={canEdit}
        initiallyArchived={brief.archived}
      />
    </div>
  );
}
