import { zonedToUtc } from "@/lib/tz"; // re-exported helpers live elsewhere; kept for parity with callers

export type DocKind = "TICKET" | "VISA";
export interface Extracted { fields: Record<string, string>; confidence: Record<string, number> }

export const TICKET_FIELDS = ["passengerName", "passportNo", "pnr", "ticketNo", "airline", "outFlightNo", "outDepartureAirport", "outDepartureAt",
  "outArrivalAirport", "outArrivalAt", "retFlightNo", "retDepartureAirport", "retDepartureAt", "retArrivalAirport", "retArrivalAt"] as const;
export const VISA_FIELDS = ["visaNo", "passengerName", "passportNo", "issueDate", "expiryDate", "permittedStayDays", "entryType"] as const;
export const REQUIRED: Record<DocKind, readonly string[]> = {
  TICKET: ["passengerName", "pnr", "ticketNo", "airline", "outFlightNo", "outDepartureAirport", "outDepartureAt", "outArrivalAirport", "outArrivalAt", "retFlightNo", "retDepartureAirport", "retDepartureAt", "retArrivalAirport", "retArrivalAt"],
  VISA: ["visaNo", "passengerName", "passportNo", "issueDate", "expiryDate", "permittedStayDays", "entryType"],
};
export const LABELS: Record<string, string> = {
  passengerName: "Passenger name", passportNo: "Passport no.", pnr: "PNR", ticketNo: "Ticket no.", airline: "Airline",
  outFlightNo: "Outbound flight", outDepartureAirport: "Departs (NG airport)", outDepartureAt: "Departure (Nigeria time)", outArrivalAirport: "Arrives (KSA airport)", outArrivalAt: "Arrival (KSA time)",
  retFlightNo: "Return flight", retDepartureAirport: "Return departs (KSA)", retDepartureAt: "Return departure (KSA time)", retArrivalAirport: "Return arrives (NG)", retArrivalAt: "Return arrival (Nigeria time)",
  visaNo: "Visa no.", issueDate: "Issue date", expiryDate: "Expiry date", permittedStayDays: "Permitted stay (days)", entryType: "Entry type",
};

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
/** Accepts "2026-12-01 21:30", "01 Dec 2026 21:30", "01/12/2026 21:30" → "YYYY-MM-DDTHH:mm" (or date-only "YYYY-MM-DD"). */
export function normDateTime(s: string): string | null {
  const t = s.trim();
  let m = /(\d{4})-(\d{2})-(\d{2})(?:[T\s]+(\d{1,2}):(\d{2}))?/.exec(t);
  if (m) return m[4] ? `${m[1]}-${m[2]}-${m[3]}T${m[4].padStart(2, "0")}:${m[5]}` : `${m[1]}-${m[2]}-${m[3]}`;
  m = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})(?:[,\s]+(\d{1,2}):(\d{2}))?/.exec(t);
  if (m && MONTHS.includes(m[2].toUpperCase())) { const mo = String(MONTHS.indexOf(m[2].toUpperCase()) + 1).padStart(2, "0"); const d = `${m[3]}-${mo}-${m[1].padStart(2, "0")}`; return m[4] ? `${d}T${m[4].padStart(2, "0")}:${m[5]}` : d; }
  m = /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(t);
  if (m) { const d = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; return m[4] ? `${d}T${m[4].padStart(2, "0")}:${m[5]}` : d; }
  return null;
}

function setField(e: Extracted, k: string, v: string | null | undefined, conf = 0.95) {
  if (v && v.trim()) { e.fields[k] = v.trim(); e.confidence[k] = conf; }
}
const grab = (text: string, re: RegExp) => re.exec(text)?.[1]?.trim();

/** Text-layer parser for label-based e-tickets (one block per passenger). Unknown layouts fall through to the LLM. */
export function parseTicketText(text: string): Extracted[] {
  const parts = text.split(/(?=^\s*Passenger(?:\s*Name)?\s*[:\-])/im).filter((p) => /Passenger/i.test(p.slice(0, 40)));
  if (!parts.length) return [];
  const head = text.slice(0, text.search(/^\s*Passenger(?:\s*Name)?\s*[:\-]/im));
  return parts.map((block) => {
    const e: Extracted = { fields: {}, confidence: {} };
    const sec = (name: string) => { const m = new RegExp(`${name}[\\s\\S]*?(?=\\n\\s*(?:OUTBOUND|RETURN|Passenger)|$)`, "i").exec(block); return m?.[0] ?? ""; };
    setField(e, "passengerName", grab(block, /Passenger(?:\s*Name)?\s*[:\-]\s*(.+)/i));
    setField(e, "passportNo", grab(block, /Passport(?:\s*No\.?|\s*Number)?\s*[:\-]\s*([A-Z0-9]{6,12})/i)?.toUpperCase(), 0.97);
    setField(e, "pnr", (grab(block, /PNR(?:\s*\/\s*Booking Ref)?\s*[:\-]\s*([A-Z0-9]{5,8})/i) ?? grab(head, /PNR(?:\s*\/\s*Booking Ref)?\s*[:\-]\s*([A-Z0-9]{5,8})/i))?.toUpperCase());
    setField(e, "ticketNo", (grab(block, /Ticket\s*(?:No\.?|Number)\s*[:\-]\s*([\d\- ]{10,17})/i))?.replace(/[\s-]/g, ""));
    setField(e, "airline", grab(block, /Airline\s*[:\-]\s*(.+)/i) ?? grab(head, /Airline\s*[:\-]\s*(.+)/i), 0.92);
    for (const [prefix, name] of [["out", "OUTBOUND"], ["ret", "RETURN"]] as const) {
      const s = sec(name);
      setField(e, `${prefix}FlightNo`, grab(s, /Flight\s*[:\-]\s*([A-Z0-9]{2}\s?\d{2,4})/i)?.replace(/\s/g, "").toUpperCase());
      const from = /From\s*[:\-]\s*([A-Z]{3})\s+(.+)/i.exec(s), to = /To\s*[:\-]\s*([A-Z]{3})\s+(.+)/i.exec(s);
      if (from) { setField(e, `${prefix}DepartureAirport`, from[1].toUpperCase()); const dt = normDateTime(from[2]); if (dt) setField(e, `${prefix}DepartureAt`, dt); }
      if (to) { setField(e, `${prefix}ArrivalAirport`, to[1].toUpperCase()); const dt = normDateTime(to[2]); if (dt) setField(e, `${prefix}ArrivalAt`, dt); }
    }
    return e;
  });
}

export function parseVisaText(text: string): Extracted[] {
  const parts = text.split(/(?=^\s*Visa\s*(?:No\.?|Number)\s*[:\-])/im).filter((p) => /Visa\s*(?:No|Number)/i.test(p.slice(0, 30)));
  return parts.map((b) => {
    const e: Extracted = { fields: {}, confidence: {} };
    setField(e, "visaNo", grab(b, /Visa\s*(?:No\.?|Number)\s*[:\-]\s*([A-Z0-9\/-]{6,20})/i)?.toUpperCase());
    setField(e, "passengerName", grab(b, /(?:Name|Holder)\s*[:\-]\s*(.+)/i));
    setField(e, "passportNo", grab(b, /Passport(?:\s*No\.?|\s*Number)?\s*[:\-]\s*([A-Z0-9]{6,12})/i)?.toUpperCase(), 0.97);
    const iss = grab(b, /Issue\s*Date\s*[:\-]\s*(.+)/i), exp = grab(b, /Expiry\s*Date\s*[:\-]\s*(.+)/i);
    if (iss) { const v = normDateTime(iss); if (v) setField(e, "issueDate", v.slice(0, 10)); }
    if (exp) { const v = normDateTime(exp); if (v) setField(e, "expiryDate", v.slice(0, 10)); }
    setField(e, "permittedStayDays", grab(b, /(?:Permitted\s*)?Stay(?:\s*Duration)?\s*[:\-]\s*(\d{1,3})/i));
    setField(e, "entryType", grab(b, /Entry\s*Type\s*[:\-]\s*(.+)/i), 0.92);
    return e;
  });
}

/** Extracts text from a text-based PDF. Returns "" for scanned PDFs. */
export async function pdfText(buf: Buffer): Promise<string> {
  // import the lib file directly: the package index runs a debug routine that reads a missing test file
  const mod: any = await import("pdf-parse/lib/pdf-parse.js");
  const fn = [mod.default, mod.default?.default, mod].find((x) => typeof x === "function") as (b: Buffer) => Promise<{ text: string }>;
  // pdf.js reads the underlying ArrayBuffer: small Buffers can be views into Node's shared pool, so copy to an unpooled one
  const own = Buffer.alloc(buf.length);
  buf.copy(own);
  // The first call in a fresh process can fail while pdf.js initialises ("Illegal character"); one retry is reliable.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try { return (await fn(Buffer.from(own))).text ?? ""; }
    catch (e) { if (attempt === 2) console.error("pdf text extraction failed:", (e as Error).message); }
  }
  return "";
}

/** Scanned/unknown-layout fallback: Anthropic document API. Requires ANTHROPIC_API_KEY; returns null when unavailable. */
export async function extractWithClaude(buf: Buffer, kind: DocKind): Promise<Extracted[] | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const fields = (kind === "TICKET" ? TICKET_FIELDS : VISA_FIELDS).join(", ");
  const prompt = `Extract every ${kind === "TICKET" ? "passenger's flight ticket" : "visa"} in this PDF (one object per person). ` +
    `Return ONLY JSON: {"records":[{"fields":{${fields}},"confidence":{<same keys, 0-1>}}]}. ` +
    `Dates as YYYY-MM-DDTHH:mm (local airport time) for flight times and YYYY-MM-DD for visa dates. Airports as 3-letter IATA codes. ` +
    `Use "" for anything you cannot read and give it confidence 0. Never guess.`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.EXTRACTION_MODEL ?? "claude-sonnet-5-5", max_tokens: 8000, messages: [{ role: "user", content: [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") } }, { type: "text", text: prompt }] }] }),
  });
  if (!r.ok) throw new Error(`Claude API ${r.status}`);
  const j: any = await r.json();
  const txt: string = j.content?.map((c: any) => c.text ?? "").join("") ?? "";
  const json = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
  return (json.records ?? []).map((x: any) => ({ fields: Object.fromEntries(Object.entries(x.fields ?? {}).filter(([, v]) => v)), confidence: x.confidence ?? {} }));
}
void zonedToUtc;
