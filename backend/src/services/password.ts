import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Passcodes hash exactly like passwords; the separate names keep call sites in routes/auth.ts honest.
export const hashPasscode = hashPassword;
export const verifyPasscode = verifyPassword;
