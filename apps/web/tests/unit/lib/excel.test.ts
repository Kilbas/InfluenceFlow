import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { generateTemplateBuffer, TEMPLATE_COLUMNS } from "@/lib/excel";

describe("excel template", () => {
  it("has the canonical column order", () => {
    expect(TEMPLATE_COLUMNS).toEqual([
      "email",
      "instagram_handle_or_url",
      "display_name",
      "language",
      "country",
      "niche",
      "followers_count",
      "phone",
      "youtube_channel_name",
      "notes",
    ]);
  });

  it("produces a parseable xlsx with header row matching column list", async () => {
    const buf = await generateTemplateBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    const headers = (ws.getRow(1).values as unknown[]).slice(1);
    expect(headers).toEqual(TEMPLATE_COLUMNS);
  });
});
