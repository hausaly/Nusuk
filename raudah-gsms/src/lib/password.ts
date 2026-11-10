import bcrypt from "bcryptjs";

const COST = 12;
export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

let dummy: Promise<string> | undefined;
/** A real hash (generated once) used to equalise timing when the account does not exist. */
export const dummyHash = () => (dummy ??= bcrypt.hash("timing-equaliser", COST));

export { PASSWORD_RULE, passwordProblem } from "./password-policy";
