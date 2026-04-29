import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { TEMPLATE_COLUMNS } from "@/lib/excel";
import { performImport } from "@/server/import";

async function file(rows: Record<string, unknown>[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("contacts");
  ws.addRow(TEMPLATE_COLUMNS);
  for (const r of rows) ws.addRow(TEMPLATE_COLUMNS.map((c) => r[c] ?? ""));
  const ab = await wb.xlsx.writeBuffer();
  return new Uint8Array(ab as ArrayBuffer);
}

async function setup() {
  await prisma.auditEvent.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.importBatch.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.user.deleteMany();
  await prisma.workspace.deleteMany();
  const ws = await prisma.workspace.create({ data: { name: "T" } });
  const a = await prisma.user.create({
    data: { workspaceId: ws.id, email: "a@x", passwordHash: await hashPassword("x"), displayName: "A", role: "member" },
  });
  const b = await prisma.user.create({
    data: { workspaceId: ws.id, email: "b@x", passwordHash: await hashPassword("x"), displayName: "B", role: "member" },
  });
  return { ws, a, b };
}

describe("performImport", () => {
  it("imports valid rows as new", async () => {
    const { ws, a } = await setup();
    const buf = await file([
      { email: "x1@x.com", instagram_handle_or_url: "@x1", display_name: "X1" },
      { email: "x2@x.com", instagram_handle_or_url: "@x2", display_name: "X2" },
    ]);
    const r = await performImport({
      workspaceId: ws.id,
      userId: a.id,
      filename: "f.xlsx",
      buffer: buf,
    });
    expect(r.batch.rowsImportedNew).toBe(2);
    expect(r.batch.rowsRejected).toBe(0);
    const count = await prisma.contact.count({ where: { ownerUserId: a.id } });
    expect(count).toBe(2);
  });

  it("skips rows already in importer's own list", async () => {
    const { ws, a } = await setup();
    await prisma.contact.create({
      data: { workspaceId: ws.id, ownerUserId: a.id, email: "x1@x.com", displayName: "Old" },
    });
    const buf = await file([
      { email: "x1@x.com", instagram_handle_or_url: "@x1", display_name: "X1" },
      { email: "x2@x.com", instagram_handle_or_url: "@x2", display_name: "X2" },
    ]);
    const r = await performImport({
      workspaceId: ws.id,
      userId: a.id,
      filename: "f.xlsx",
      buffer: buf,
    });
    expect(r.batch.rowsSkippedOwnDuplicate).toBe(1);
    expect(r.batch.rowsImportedNew).toBe(1);
  });

  it("imports colleague-overlapping rows but flags them", async () => {
    const { ws, a, b } = await setup();
    await prisma.contact.create({
      data: { workspaceId: ws.id, ownerUserId: b.id, email: "shared@x.com", displayName: "B" },
    });
    const buf = await file([
      { email: "shared@x.com", instagram_handle_or_url: "@s", display_name: "S" },
    ]);
    const r = await performImport({
      workspaceId: ws.id,
      userId: a.id,
      filename: "f.xlsx",
      buffer: buf,
    });
    expect(r.batch.rowsImportedWithColleagueWarning).toBe(1);
    const aContacts = await prisma.contact.findMany({ where: { ownerUserId: a.id } });
    expect(aContacts.length).toBe(1);
    expect(r.colleagueWarnings.find((w) => w.email === "shared@x.com")?.colleagueDisplayName).toBe("B");
  });

  it("rejects rows with invalid email", async () => {
    const { ws, a } = await setup();
    const buf = await file([
      { email: "not-an-email", instagram_handle_or_url: "@x", display_name: "X" },
      { email: "ok@x.com", instagram_handle_or_url: "@y", display_name: "Y" },
    ]);
    const r = await performImport({
      workspaceId: ws.id,
      userId: a.id,
      filename: "f.xlsx",
      buffer: buf,
    });
    expect(r.batch.rowsRejected).toBe(1);
    expect(r.batch.rowsImportedNew).toBe(1);
    const report = r.batch.rejectionReport as Array<{ reason: string }>;
    expect(report[0].reason).toMatch(/invalid_email/);
  });

  it("rejects rows missing required fields", async () => {
    const { ws, a } = await setup();
    const buf = await file([
      { email: "ok@x.com", instagram_handle_or_url: "", display_name: "X" },
      { email: "ok2@x.com", instagram_handle_or_url: "@i", display_name: "" },
    ]);
    const r = await performImport({
      workspaceId: ws.id,
      userId: a.id,
      filename: "f.xlsx",
      buffer: buf,
    });
    expect(r.batch.rowsRejected).toBe(2);
  });

  it("sha256 file hash is recorded", async () => {
    const { ws, a } = await setup();
    const buf = await file([{ email: "z@x.com", instagram_handle_or_url: "@z", display_name: "Z" }]);
    const r = await performImport({
      workspaceId: ws.id,
      userId: a.id,
      filename: "f.xlsx",
      buffer: buf,
    });
    expect(r.batch.fileHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
