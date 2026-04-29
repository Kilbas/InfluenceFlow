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

export type ParsedRow = {
  rowNumber: number;
  email: string;
  instagram_handle_or_url: string;
  display_name: string;
  language: string;
  country: string;
  niche: string;
  followers_count: string;
  phone: string;
  youtube_channel_name: string;
  notes: string;
};

export async function parseImportFile(buf: Uint8Array): Promise<{ rows: ParsedRow[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("workbook has no sheets");

  const headerRow = ws.getRow(1);
  const headerValues = headerRow.values as unknown[];
  const headers = headerValues.slice(1).map((v) => String(v ?? "").trim());

  for (let i = 0; i < TEMPLATE_COLUMNS.length; i++) {
    if (headers[i] !== TEMPLATE_COLUMNS[i]) {
      throw new Error(
        `Invalid header at column ${i + 1}: expected "${TEMPLATE_COLUMNS[i]}", got "${headers[i] ?? ""}"`
      );
    }
  }

  const rows: ParsedRow[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cellsRaw = row.values as unknown[];
    const cells = cellsRaw.slice(1);
    if (cells.every((c) => c === null || c === undefined || String(c).trim() === "")) return;
    const get = (i: number) => String(cells[i] ?? "").trim();
    rows.push({
      rowNumber,
      email: get(0),
      instagram_handle_or_url: get(1),
      display_name: get(2),
      language: get(3),
      country: get(4),
      niche: get(5),
      followers_count: get(6),
      phone: get(7),
      youtube_channel_name: get(8),
      notes: get(9),
    });
  });

  return { rows };
}
