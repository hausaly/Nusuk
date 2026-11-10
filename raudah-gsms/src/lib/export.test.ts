import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { reportPdf, reportXlsx, pilgrimTemplateXlsx } from "./report-render";
import { pdfText } from "@/services/extraction";
import { getFile, putFile, signedUrl, verifySignature } from "./storage";

const data = { title: "Rooming list – Test Hotel", subtitle: "UMR-2026-001 · Test", columns: ["Room", "Pilgrim"], rows: [["101", "MUSA ADAMU"], ["102", "FATIMA BELLO"]] };

describe("branded exports (acceptance 8)", () => {
  it("Excel: logo image, company name, Primary-filled bold white header row, frozen header", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await reportXlsx(data)) as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    expect(ws.getImages()).toHaveLength(1);                                   // logo
    expect(ws.getCell("C1").value).toBe("Raudah Travels & Tours Ltd");
    const h = ws.getCell("A5");
    expect(h.fill).toMatchObject({ fgColor: { argb: "FF3F4096" } });          // Raudah Blue
    expect(h.font).toMatchObject({ bold: true, color: { argb: "FFFFFFFF" } });
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 5 });
  });

  it("PDF: embeds the logo image and prints the branded footer with page numbers", async () => {
    const pdf = await reportPdf(data);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1")).toContain("/Subtype /Image");               // logo
    const text = await pdfText(pdf);
    expect(text).toContain("Raudah Travels & Tours Ltd · Generated");
    expect(text).toMatch(/Page 1 of 1/);
    expect(text).toContain("Rooming list");
  });

  it("import template is branded too and lists the expected columns", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await pilgrimTemplateXlsx(["Alpha"])) as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    expect(ws.getImages()).toHaveLength(1);
    expect(String(ws.getCell("A5").value)).toBe("Full Name");
  });

  it("login/header use the logo file and brand tokens", async () => {
    const css = await readFile(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toContain("--primary: 63 64 150");   // #3F4096
    expect(css).toContain("--accent: 232 53 59");    // #E8353B
    expect(css).toContain("--surface-2: 230 231 232"); // #E6E7E8
    const tw = await readFile(path.join(process.cwd(), "tailwind.config.ts"), "utf8");
    expect(tw).toContain("Marcellus"); expect(tw).toContain("Inter");
    const manifest = await readFile(path.join(process.cwd(), "src/app/manifest.ts"), "utf8");
    expect(manifest).toContain('name: "Raudah GSMS"'); expect(manifest).toContain("#3F4096");
  });
});

describe("file storage security", () => {
  it("files are encrypted at rest and round-trip intact", async () => {
    const pdf = Buffer.from("%PDF-1.4 secret passport data 1234567890");
    await putFile("groups/test/enc.pdf", pdf);
    const raw = await readFile(path.join(process.env.STORAGE_DIR!, "groups/test/enc.pdf"));
    expect(raw.includes("secret passport data")).toBe(false);
    expect((await getFile("groups/test/enc.pdf")).equals(pdf)).toBe(true);
  });
  it("signed URLs expire and cannot be forged or reused for another file", () => {
    const now = Date.now();
    const url = new URL("http://x" + signedUrl("groups/a/b.pdf", 300, now));
    const exp = Number(url.searchParams.get("exp")), sig = url.searchParams.get("sig")!;
    expect(verifySignature("groups/a/b.pdf", exp, sig, now + 299_000)).toBe(true);
    expect(verifySignature("groups/a/b.pdf", exp, sig, now + 301_000)).toBe(false);   // expired
    expect(verifySignature("groups/a/other.pdf", exp, sig, now)).toBe(false);         // other file
    expect(verifySignature("groups/a/b.pdf", exp + 3600, sig, now)).toBe(false);      // extended expiry
  });
  it("rejects path traversal keys", async () => { await expect(getFile("../etc/passwd")).rejects.toThrow(); });
});
