import { BriefForm } from "../BriefForm";

export default function NewBriefPage() {
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">New brief</h1>
      <BriefForm canEdit={true} canArchive={false} />
    </div>
  );
}
