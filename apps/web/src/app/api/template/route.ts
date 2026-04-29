import { generateTemplateBuffer } from "@/lib/excel";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const buf = await generateTemplateBuffer();
  return new Response(buf as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="influenceflow_template.xlsx"',
    },
  });
}
