import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { generateTemplateBuffer, parseImportFile, TEMPLATE_COLUMNS } from "@/lib/excel";

async function makeFile(rows: Record<string, unknown>[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("contacts");
  ws.addRow(TEMPLATE_COLUMNS);
  for (const r of rows) {
    ws.addRow(TEMPLATE_COLUMNS.map((c) => r[c] ?? ""));
  }
  const ab = await wb.xlsx.writeBuffer();
  return new Uint8Array(ab as ArrayBuffer);
}

describe("parseImportFile", () => {
  it("rejects file with wrong header", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("contacts");
    ws.addRow(["wrong", "headers"]);
    const ab = await wb.xlsx.writeBuffer();
    await expect(parseImportFile(new Uint8Array(ab as ArrayBuffer))).rejects.toThrow(/header/i);
  });

  it("returns parsed rows with row numbers", async () => {
    const buf = await makeFile([
      { email: "a@x.com", instagram_handle_or_url: "@a", display_name: "Alice" },
      { email: "b@x.com", instagram_handle_or_url: "b", display_name: "Bob" },
    ]);
    const result = await parseImportFile(buf);
    expect(result.rows.length).toBe(2);
    expect(result.rows[0].rowNumber).toBe(2);
    expect(result.rows[0].email).toBe("a@x.com");
  });

  it("handles empty trailing rows", async () => {
    const buf = await makeFile([
      { email: "a@x.com", instagram_handle_or_url: "@a", display_name: "A" },
      {},
      {},
    ]);
    const result = await parseImportFile(buf);
    expect(result.rows.length).toBe(1);
  });
});

// Ensure generateTemplateBuffer is importable (no regression)
it("generateTemplateBuffer is exported", () => {
  expect(generateTemplateBuffer).toBeInstanceOf(Function);
});
