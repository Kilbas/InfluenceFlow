import ExcelJS from "exceljs";

export const TEMPLATE_COLUMNS = [
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
] as const;

export async function generateTemplateBuffer(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("contacts");
  ws.addRow(TEMPLATE_COLUMNS);
  ws.getRow(1).font = { bold: true };
  for (let i = 1; i <= TEMPLATE_COLUMNS.length; i++) {
    ws.getColumn(i).width = 20;
  }
  const ab = await wb.xlsx.writeBuffer();
  return new Uint8Array(ab as ArrayBuffer);
}
