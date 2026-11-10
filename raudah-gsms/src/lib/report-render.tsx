import path from "node:path";
import { readFileSync } from "node:fs";
import React from "react";
import { Document, Font, Image, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import ExcelJS from "exceljs";
import type { ReportData } from "@/services/reports";

const BLUE = "#3F4096", LOGO = path.join(process.cwd(), "public/brand/logo.png");
const font = (f: string) => path.join(process.cwd(), "node_modules/@fontsource/marcellus/files", f);
let registered = false;
function registerFonts() {
  if (registered) return;
  try { Font.register({ family: "Marcellus", src: font("marcellus-latin-400-normal.woff") }); } catch { /* falls back to Times */ }
  registered = true;
}

const s = StyleSheet.create({
  page: { padding: 28, paddingBottom: 46, fontSize: 8, fontFamily: "Helvetica", color: "#1F2133" },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 8, borderBottomWidth: 1.5, borderBottomColor: BLUE, marginBottom: 10 },
  title: { fontFamily: "Marcellus", fontSize: 16, color: BLUE }, sub: { fontSize: 8, color: "#6B6E80", marginTop: 2 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#E6E7E8" },
  th: { backgroundColor: BLUE, color: "#fff", fontFamily: "Helvetica-Bold", padding: 4 }, td: { padding: 4 },
  foot: { position: "absolute", bottom: 18, left: 28, right: 28, fontSize: 7, color: "#6B6E80", textAlign: "center" },
});

function ReportPdf({ r, generated }: { r: ReportData; generated: string }) {
  const w = `${100 / r.columns.length}%`;
  return (
    <Document title={r.title} author="Raudah Travels & Tours Ltd">
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.head} fixed>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={LOGO} style={{ height: 34, width: 67 }} />
          <View style={{ alignItems: "flex-end" }}><Text style={s.title}>{r.title}</Text><Text style={s.sub}>{r.subtitle}</Text></View>
        </View>
        <View style={s.row} fixed>{r.columns.map((c) => <Text key={c} style={[s.th, { width: w }]}>{c}</Text>)}</View>
        {r.rows.map((row, i) => (
          <View key={i} style={[s.row, i % 2 ? { backgroundColor: "#F7F7F9" } : {}]} wrap={false}>{row.map((c, j) => <Text key={j} style={[s.td, { width: w }]}>{c}</Text>)}</View>
        ))}
        {!r.rows.length && <Text style={{ padding: 10, color: "#6B6E80" }}>No records.</Text>}
        <Text style={s.foot} fixed render={({ pageNumber, totalPages }) => `Raudah Travels & Tours Ltd · Generated ${generated} · Page ${pageNumber} of ${totalPages}`} />
      </Page>
    </Document>
  );
}

export async function reportPdf(r: ReportData): Promise<Buffer> {
  registerFonts();
  const generated = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" }).format(new Date()) + " (Lagos)";
  return renderToBuffer(<ReportPdf r={r} generated={generated} />);
}

export async function reportXlsx(r: ReportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Raudah Travels & Tours Ltd";
  const ws = wb.addWorksheet(r.title.slice(0, 30).replace(/[\\/?*[\]:]/g, "-"));
  const logo = wb.addImage({ buffer: readFileSync(LOGO) as unknown as ExcelJS.Buffer, extension: "png" });
  ws.addImage(logo, { tl: { col: 0, row: 0 }, ext: { width: 110, height: 56 } });
  ws.getCell("C1").value = "Raudah Travels & Tours Ltd"; ws.getCell("C1").font = { bold: true, size: 14, color: { argb: "FF3F4096" } };
  ws.getCell("C2").value = r.title; ws.getCell("C2").font = { bold: true, size: 12 };
  ws.getCell("C3").value = r.subtitle; ws.getCell("C3").font = { color: { argb: "FF6B6E80" } };
  ws.getRow(1).height = 22; ws.getRow(2).height = 20; ws.getRow(3).height = 18;
  const hr = ws.getRow(5);
  r.columns.forEach((c, i) => { const cell = hr.getCell(i + 1); cell.value = c; cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3F4096" } }; });
  r.rows.forEach((row) => ws.addRow(row));
  r.columns.forEach((c, i) => { ws.getColumn(i + 1).width = Math.min(40, Math.max(c.length + 4, ...r.rows.slice(0, 200).map((x) => (x[i] ?? "").length + 2))); });
  ws.views = [{ state: "frozen", ySplit: 5 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Branded import template for pilgrims (logo, company name, Primary header, example row). */
export async function pilgrimTemplateXlsx(agentNames: string[]): Promise<Buffer> {
  const { IMPORT_COLUMNS } = await import("@/services/pilgrims");
  const r: ReportData = { title: "Pilgrim import template", subtitle: "Fill from row 6 down. Dates as YYYY-MM-DD. Gender M/F. Agent Group Name must match an existing agent." + (agentNames.length ? ` Agents: ${agentNames.join(", ")}` : ""), columns: [...IMPORT_COLUMNS],
    rows: [["MUSA ADAMU IBRAHIM", "A12345678", "2029-05-30", "1975-03-14", "M", "08031234567", agentNames[0] ?? "Agent name", "Amina Musa", "08039876543", "", "", "", "FAM-001"]] };
  return reportXlsx(r);
}
void React;
