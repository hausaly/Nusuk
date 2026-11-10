import { authenticator } from "otplib";
import QRCode from "qrcode";

authenticator.options = { window: 1, step: 30, digits: 6 };

export const TOTP_ISSUER = "Raudah GSMS";

export const generateTotpSecret = () => authenticator.generateSecret();

export const totpUri = (accountName: string, secret: string) =>
  authenticator.keyuri(accountName, TOTP_ISSUER, secret);

export function verifyTotp(token: string, secret: string): boolean {
  const t = token.replace(/\s/g, "");
  if (!/^\d{6}$/.test(t)) return false;
  try {
    return authenticator.check(t, secret);
  } catch {
    return false;
  }
}

export const totpQrDataUrl = (uri: string) => QRCode.toDataURL(uri, { margin: 1, width: 220 });
