/** Client-safe password policy (no bcrypt import). */
export const PASSWORD_RULE = "At least 10 characters, with at least one letter and one number.";

export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return PASSWORD_RULE;
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return PASSWORD_RULE;
  if (pw.length > 128) return "Password is too long (max 128 characters).";
  return null;
}
