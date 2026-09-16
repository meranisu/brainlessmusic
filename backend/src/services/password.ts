import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// A passcode is hashed and compared exactly like a password — bcrypt doesn't
// care that the input is four to eight digits rather than a sentence — but
// naming the functions after what's actually being checked at each call site
// is cheap and keeps `routes/auth.ts` from reading like a password check that
// secretly isn't one.
export const hashPasscode = hashPassword;
export const verifyPasscode = verifyPassword;
