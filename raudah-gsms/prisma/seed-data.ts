/** Deterministic demo data shared by the seed and the sample-PDF generator (so PDFs match seeded pilgrims). */
export interface DemoPilgrim {
  idx: number; fullName: string; passportNo: string; gender: "M" | "F"; dob: string; passportExpiry: string; phone: string;
  agentIdx: 0 | 1 | 2; familyLinkId: string | null; specialNeeds: string | null;
  flight: 0 | 1 | 2; ret: 0 | 1; pnr: string; ticketNo: string; visaNo: string;
}

export const FLIGHTS = [
  { no: "P4 7120", airline: "Air Peace", dep: "LOS", depAt: "2026-12-01T21:30", arr: "JED", arrAt: "2026-12-02T05:45" },
  { no: "SV 0870", airline: "Saudia", dep: "ABV", depAt: "2026-12-02T10:00", arr: "JED", arrAt: "2026-12-02T18:20" },
  { no: "P4 7122", airline: "Air Peace", dep: "KAN", depAt: "2026-12-03T02:00", arr: "MED", arrAt: "2026-12-03T09:30" },
] as const;
export const RETURNS = [
  { no: "P4 7121", dep: "MED", depAt: "2026-12-12T08:10", arr: "LOS", arrAt: "2026-12-12T13:20" },
  { no: "SV 0871", dep: "JED", depAt: "2026-12-12T13:00", arr: "ABV", arrAt: "2026-12-12T18:10" },
] as const;

const MALE = ["Musa", "Ibrahim", "Abubakar", "Yusuf", "Suleiman", "Aminu", "Garba", "Usman", "Bashir", "Sani", "Lawal", "Haruna", "Nasiru", "Idris", "Kabiru", "Shehu", "Umar", "Zakari", "Danjuma", "Isah"];
const FEMALE = ["Fatima", "Aisha", "Hauwa", "Zainab", "Maryam", "Khadija", "Amina", "Rabi", "Hadiza", "Safiya", "Ramatu", "Binta", "Hafsat", "Nafisa", "Jamila", "Asma'u", "Rukayya", "Halima", "Sa'adatu", "Zulaihat"];
const SURN = ["Adamu", "Bello", "Danladi", "Abdullahi", "Mohammed", "Garba", "Lawan", "Sadiq", "Hassan", "Salisu", "Ahmad", "Tijani", "Bala", "Yakubu", "Gambo", "Tukur", "Jibril", "Mustapha", "Shuaibu", "Waziri"];

function prng(seed: number) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296); }

export function makePilgrims(n = 150): DemoPilgrim[] {
  const r = prng(2026);
  const out: DemoPilgrim[] = [];
  let fam = 0;
  for (let i = 1; i <= n; i++) {
    const gender: "M" | "F" = r() < 0.55 ? "M" : "F";
    const first = (gender === "M" ? MALE : FEMALE)[Math.floor(r() * 20)];
    const sur = SURN[Math.floor(r() * 20)], mid = SURN[Math.floor(r() * 20)];
    // every 12th pilgrim starts a couple/family of 2-3 (same surname, family link)
    const familyStart = i % 12 === 0 && i <= 120;
    if (familyStart) fam++;
    const inFamily = i > 1 && i <= 122 && (i % 12 === 0 || i % 12 === 1 || (i % 12 === 2 && i % 24 === 14));
    const flight = (i <= 60 ? 0 : i <= 110 ? 1 : 2) as 0 | 1 | 2;
    out.push({
      idx: i, fullName: `${first} ${mid} ${sur}`.toUpperCase(), passportNo: `A${String(10000000 + i * 7919 % 89999999).slice(0, 8)}`,
      gender, dob: `${1950 + Math.floor(r() * 45)}-${String(1 + Math.floor(r() * 12)).padStart(2, "0")}-${String(1 + Math.floor(r() * 28)).padStart(2, "0")}`,
      passportExpiry: `${2029 + Math.floor(r() * 5)}-${String(1 + Math.floor(r() * 12)).padStart(2, "0")}-15`,
      phone: `0803${String(1000000 + i * 313).slice(0, 7)}`, agentIdx: (i % 3) as 0 | 1 | 2,
      familyLinkId: inFamily ? `FAM-${String(fam || 1).padStart(3, "0")}` : null,
      specialNeeds: i % 17 === 0 ? "Wheelchair – walks with difficulty" : i % 29 === 0 ? "Diabetic – needs medication on schedule" : null,
      flight, ret: (i % 2) as 0 | 1,
      pnr: `R${String(i * 7919 % 99999).padStart(5, "0").replace(/\d/g, (d) => "ABCDEFGHJK"[+d])}`.slice(0, 6),
      ticketNo: String(1762000000000 + i * 1237),
      visaNo: `V${String(40000000 + i * 997)}`,
    });
  }
  // family members must share gender-compatible surname & agent: copy from the family starter
  const byFam = new Map<string, DemoPilgrim[]>();
  for (const p of out) if (p.familyLinkId) byFam.set(p.familyLinkId, [...(byFam.get(p.familyLinkId) ?? []), p]);
  for (const members of byFam.values()) {
    const base = members[0];
    for (const m of members.slice(1)) { m.agentIdx = base.agentIdx; m.flight = base.flight; m.ret = base.ret; m.fullName = `${m.fullName.split(" ")[0]} ${base.fullName.split(" ").slice(1).join(" ")}`; }
  }
  return out;
}

/** Which pilgrims have which checks pending (deterministic, mixed). Pilgrims 141-150 are reserved for the sample PDFs. */
export function pendingChecks(p: DemoPilgrim): ("PAYMENT" | "DOCUMENTS" | "VISA" | "TICKET")[] {
  if (p.idx >= 141 && p.idx <= 145) return ["TICKET"];       // group ticket PDF (5 passengers)
  if (p.idx >= 146 && p.idx <= 148) return ["VISA"];         // text visa PDFs
  if (p.idx === 149) return ["TICKET"];                      // scanned ticket
  if (p.idx === 150) return ["VISA"];                        // scanned visa
  const k = p.idx % 10;
  if (k === 3) return ["PAYMENT"];
  if (k === 6) return ["PAYMENT", "DOCUMENTS"];
  if (k === 8) return ["DOCUMENTS"];
  if (k === 9 && p.idx % 20 === 9) return ["VISA"];
  if (k === 0 && p.idx % 20 === 10) return ["TICKET", "PAYMENT"];
  return [];
}
