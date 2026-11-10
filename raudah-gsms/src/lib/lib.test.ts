import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./crypto";
import { diffRecords, redact, snapshot } from "./audit";
import { passwordProblem } from "./password-policy";
import { createLimiter } from "./rate-limit";
import { normalizePhone, parseIdentifier } from "./utils";
import { generateTotpSecret, verifyTotp } from "./totp";
import { authenticator } from "otplib";

describe("crypto", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encryptSecret("JBSWY3DPEHPK3PXP"), b = encryptSecret("JBSWY3DPEHPK3PXP");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("JBSWY3DPEHPK3PXP");
  });
  it("rejects tampered ciphertext", () => {
    const p = encryptSecret("secret").split(".");
    p[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(p.join("."))).toThrow();
  });
});

describe("totp", () => {
  it("accepts a current code and rejects junk", () => {
    const s = generateTotpSecret();
    expect(verifyTotp(authenticator.generate(s), s)).toBe(true);
    expect(verifyTotp("000000", s) && verifyTotp("abcdef", s)).toBe(false);
  });
});

describe("audit diff", () => {
  it("reports only changed fields with old/new values and ignores timestamps", () => {
    const changes = diffRecords({ name: "A", role: "AGENT", updatedAt: new Date(1) }, { name: "B", role: "AGENT", updatedAt: new Date(2) });
    expect(changes).toEqual([{ field: "name", oldValue: "A", newValue: "B" }]);
  });
  it("never leaks password hashes or TOTP secrets", () => {
    expect(redact("passwordHash", "$2a$secret")).toBe("[redacted]");
    expect(snapshot({ name: "x", passwordHash: "h", totpSecretEnc: "t" })).not.toMatch(/"h"|"t"/);
    const d = diffRecords({ passwordHash: "HASH-BEFORE-9f2" }, { passwordHash: "HASH-AFTER-7c1" });
    expect(JSON.stringify(d)).not.toMatch(/HASH-(BEFORE|AFTER)/);
    expect(d).toHaveLength(1); // the change itself is still recorded
  });
});

describe("password policy", () => {
  it.each([["short1", false], ["longenoughbutnodigit", false], ["1234567890123", false], ["Raudah#2026", true]])("%s valid=%s", (pw, ok) =>
    expect(passwordProblem(pw) === null).toBe(ok));
});

describe("rate limiter", () => {
  it("blocks after max hits and frees up after the window", () => {
    let t = 0;
    const l = createLimiter(3, 1000, () => t);
    expect([l.hit("k"), l.hit("k"), l.hit("k"), l.hit("k")]).toEqual([true, true, true, false]);
    expect(l.blocked("k")).toBe(true);
    t = 1001;
    expect(l.blocked("k")).toBe(false);
    expect(l.hit("k")).toBe(true);
  });
});

describe("phone / identifier normalisation", () => {
  it("normalises Nigerian numbers", () => {
    expect(normalizePhone("0803 000 0001")).toBe("+2348030000001");
    expect(normalizePhone("2348030000001")).toBe("+2348030000001");
    expect(normalizePhone("+966 55 123 4567")).toBe("+966551234567");
  });
  it("detects e-mail vs phone identifiers", () => {
    expect(parseIdentifier(" Admin@Raudah.Test ")).toEqual({ email: "admin@raudah.test" });
    expect(parseIdentifier("08030000001")).toEqual({ phone: "+2348030000001" });
  });
});
