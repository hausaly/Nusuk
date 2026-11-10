/**
 * Generates sample ticket/visa PDFs for testing extraction (`npm run samples`) into ./samples:
 *  - tickets/*.pdf         text-based (single, and one GROUP ticket with 5 passengers)
 *  - visas/*.pdf           text-based (one expires before the return flight → validation warning)
 *  - scanned/*.pdf         image-only (needs the Claude fallback or manual entry)
 * They match the seeded demo pilgrims 141-150 (those pilgrims have TICKET or VISA pending).
 */
import React from "react";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { FLIGHTS, RETURNS, makePilgrims } from "../prisma/seed-data";

const st = StyleSheet.create({ page: { padding: 36, fontSize: 11, fontFamily: "Helvetica" }, h: { fontSize: 15, marginBottom: 10, fontFamily: "Helvetica-Bold" }, b: { marginBottom: 12 }, l: { marginBottom: 3 } });
const demo = makePilgrims(150);
const P = (i: number) => demo[i - 1];

const ticketLines = (p: ReturnType<typeof P>) => {
  const f = FLIGHTS[p.flight], r = RETURNS[p.ret];
  return [`Passenger: ${p.fullName} MR`, `Passport No: ${p.passportNo}`, `Ticket No: ${p.ticketNo}`, "OUTBOUND", `Flight: ${f.no}`, `From: ${f.dep} ${f.depAt.replace("T", " ")}`, `To: ${f.arr} ${f.arrAt.replace("T", " ")}`,
    "RETURN", `Flight: ${r.no}`, `From: ${r.dep} ${r.depAt.replace("T", " ")}`, `To: ${r.arr} ${r.arrAt.replace("T", " ")}`];
};
const ticketDoc = (ps: ReturnType<typeof P>[]) => (
  <Document><Page size="A4" style={st.page}>
    <Text style={st.h}>E-TICKET ITINERARY RECEIPT</Text>
    <Text style={st.l}>Airline: {FLIGHTS[ps[0].flight].airline}</Text><Text style={st.b}>PNR: {ps[0].pnr}</Text>
    {ps.map((p) => <View key={p.idx} style={st.b}>{ticketLines(p).map((l, i) => <Text key={i} style={st.l}>{l}</Text>)}</View>)}
  </Page></Document>
);
const visaDoc = (p: ReturnType<typeof P>, expiry = "2027-02-15") => (
  <Document><Page size="A4" style={st.page}>
    <Text style={st.h}>KINGDOM OF SAUDI ARABIA – UMRAH VISA</Text>
    {[`Visa No: ${p.visaNo}`, `Name: ${p.fullName}`, `Passport No: ${p.passportNo}`, "Issue Date: 2026-10-15", `Expiry Date: ${expiry}`, "Permitted Stay: 30", "Entry Type: Umrah – Single entry"].map((l, i) => <Text key={i} style={st.l}>{l}</Text>)}
  </Page></Document>
);

async function main() {
  for (const d of ["tickets", "visas", "scanned"]) mkdirSync(`samples/${d}`, { recursive: true });
  writeFileSync("samples/tickets/group-ticket-5-passengers.pdf", await renderToBuffer(ticketDoc([141, 142, 143, 144, 145].map(P))));
  for (const i of [146, 147, 148]) writeFileSync(`samples/visas/visa-${P(i).passportNo}.pdf`, await renderToBuffer(visaDoc(P(i), i === 148 ? "2026-12-10" : "2027-02-15")));
  // scanned = rasterised text → image-only PDF (no text layer)
  const scanned = [{ file: "samples/scanned/scanned-ticket.pdf", lines: ["E-TICKET ITINERARY RECEIPT", `Airline: ${FLIGHTS[P(149).flight].airline}`, `PNR: ${P(149).pnr}`, ...ticketLines(P(149))] },
    { file: "samples/scanned/scanned-visa.pdf", lines: ["KINGDOM OF SAUDI ARABIA - UMRAH VISA", `Visa No: ${P(150).visaNo}`, `Name: ${P(150).fullName}`, `Passport No: ${P(150).passportNo}`, "Issue Date: 2026-10-15", "Expiry Date: 2027-02-15", "Permitted Stay: 30", "Entry Type: Umrah"] }];
  for (const s of scanned)
    execFileSync("python3", ["-c", `
import sys, json
from PIL import Image, ImageDraw, ImageFont, ImageFilter
lines = json.loads(sys.argv[1]); out = sys.argv[2]
img = Image.new("L", (1240, 1754), 245); d = ImageDraw.Draw(img)
try: f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 30)
except Exception: f = ImageFont.load_default()
y = 120
for l in lines: d.text((100, y), l, font=f, fill=40); y += 52
img.rotate(0.6, fillcolor=245).filter(ImageFilter.GaussianBlur(0.8)).convert("RGB").save(out, "PDF", resolution=150)
`, JSON.stringify(s.lines), s.file]);
  console.log("Sample PDFs written to ./samples");
}
main();
