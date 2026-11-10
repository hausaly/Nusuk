import { Field, Input, Select } from "@/components/ui/input";

type V = Partial<Record<string, string | null>>;
export function PilgrimFields({ v = {}, agents }: { v?: V; agents: { id: string; groupName: string }[] }) {
  const d = (k: string) => v[k] ?? "";
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Full name (as in passport)" htmlFor="fullName"><Input id="fullName" name="fullName" required defaultValue={d("fullName")} /></Field>
      <Field label="Agent group" htmlFor="agentId"><Select id="agentId" name="agentId" required defaultValue={d("agentId")}><option value="">Select…</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.groupName}</option>)}</Select></Field>
      <Field label="Passport no." htmlFor="passportNo"><Input id="passportNo" name="passportNo" required defaultValue={d("passportNo")} /></Field>
      <Field label="Passport expiry" htmlFor="passportExpiry"><Input id="passportExpiry" name="passportExpiry" type="date" required defaultValue={d("passportExpiry")} /></Field>
      <Field label="Date of birth" htmlFor="dateOfBirth"><Input id="dateOfBirth" name="dateOfBirth" type="date" required defaultValue={d("dateOfBirth")} /></Field>
      <Field label="Gender" htmlFor="gender"><Select id="gender" name="gender" required defaultValue={d("gender")}><option value="">Select…</option><option value="M">Male</option><option value="F">Female</option></Select></Field>
      <Field label="Phone (Nigeria)" htmlFor="phoneNigeria"><Input id="phoneNigeria" name="phoneNigeria" inputMode="tel" required defaultValue={d("phoneNigeria")} /></Field>
      <Field label="Phone (KSA)" htmlFor="phoneKsa"><Input id="phoneKsa" name="phoneKsa" inputMode="tel" defaultValue={d("phoneKsa")} /></Field>
      <Field label="WhatsApp" htmlFor="whatsapp"><Input id="whatsapp" name="whatsapp" inputMode="tel" defaultValue={d("whatsapp")} /></Field>
      <Field label="Special needs" htmlFor="specialNeeds" hint="Wheelchair / medical / elderly + note"><Input id="specialNeeds" name="specialNeeds" defaultValue={d("specialNeeds")} /></Field>
      <Field label="Emergency contact name" htmlFor="emergencyContactName"><Input id="emergencyContactName" name="emergencyContactName" required defaultValue={d("emergencyContactName")} /></Field>
      <Field label="Emergency contact phone" htmlFor="emergencyContactPhone"><Input id="emergencyContactPhone" name="emergencyContactPhone" inputMode="tel" required defaultValue={d("emergencyContactPhone")} /></Field>
      <Field label="Family link ID" htmlFor="familyLinkId" hint="Pilgrims with the same ID are kept together in rooms"><Input id="familyLinkId" name="familyLinkId" defaultValue={d("familyLinkId")} /></Field>
    </div>
  );
}
